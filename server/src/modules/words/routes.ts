import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, desc, asc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  words, wordAttributeValues, wordRelations, wordDerivatives,
  attributes, derivativeTypes,
} from '../../db/schema/index.js';
import { requireProjectAccess } from '../../middleware/auth.js';
import { createVersion, getVersionHistory, getVersionById } from '../versioning/service.js';
import { runWordValidation, generateDerivatives, getWordAttributeValues, buildWordSnapshot } from './service.js';
import type { Attribute } from './service.js';

export async function wordRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  app.get(`${projectPrefix}/words`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const { cursor, limit: limitStr, sort, order } = request.query as {
      cursor?: string; limit?: string; sort?: string; order?: string;
    };
    const limit = Math.min(parseInt(limitStr || '50'), 100);

    let query = db.select()
      .from(words)
      .where(and(eq(words.projectId, projectId), isNull(words.deletedAt)))
      .limit(limit + 1)
      .orderBy(order === 'asc' ? asc(words.createdAt) : desc(words.createdAt));

    const results = await query;
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    // Shared attribute map avoids a per-word re-query inside
    // getWordAttributeValues when enriching many words at once.
    const projectAttrs = await db.select().from(attributes)
      .where(and(eq(attributes.projectId, projectId), isNull(attributes.deletedAt)));
    const attributeMap: Map<string, Attribute> = new Map(projectAttrs.map(a => [a.id, a]));

    const enrichedItems = await Promise.all(items.map(async (word) => {
      const attrValues = await getWordAttributeValues(word.id, attributeMap);
      const derivatives = await getWordDerivativesResponse(word.id);
      return { ...word, attributeValues: attrValues, derivatives };
    }));

    return {
      items: enrichedItems,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };
  });

  // No DB writes — shares the code path with save-time validation so the
  // client can preview errors without having to actually submit.
  app.post(`${projectPrefix}/words/validate`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      attributeValues: Record<string, unknown>;
      excludeWordId?: string;
    };
    const result = await runWordValidation(
      projectId,
      body.attributeValues ?? {},
      body.excludeWordId,
    );
    return result;
  });

  app.post(`${projectPrefix}/words`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      attributeValues: Record<string, unknown>;
    };

    const validation = await runWordValidation(projectId, body.attributeValues);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const word = await db.transaction(async (tx) => {
      const [created] = await tx.insert(words).values({
        projectId,
        createdBy: request.userId!,
      }).returning();

      await saveAttributeValues(tx, created.id, projectId, body.attributeValues);

      return created;
    });

    // Done outside the transaction because both are recoverable:
    // derivatives can be regenerated, versions are audit data.
    await generateDerivatives(projectId, word.id, body.attributeValues);

    const snapshot = await buildWordSnapshot(word.id);
    await createVersion('word', word.id, request.userId!, snapshot, 'created');

    return {
      ...word,
      attributeValues: body.attributeValues,
      derivatives: await getWordDerivativesResponse(word.id),
      validation: { warnings: validation.warnings },
    };
  });

  app.get(`${projectPrefix}/words/:id`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const word = await db.query.words.findFirst({
      where: and(eq(words.id, id), isNull(words.deletedAt)),
    });

    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    const attrValues = await getWordAttributeValues(id);
    const derivatives = await getWordDerivativesResponse(id);
    const relations = await getWordRelationsResponse(id);

    return {
      ...word,
      attributeValues: attrValues,
      derivatives,
      relations,
    };
  });

  app.put(`${projectPrefix}/words/:id`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const body = request.body as { attributeValues: Record<string, unknown> };

    const word = await db.query.words.findFirst({
      where: and(eq(words.id, id), isNull(words.deletedAt)),
    });

    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    // Exclude the current word from unique checks.
    const validation = await runWordValidation(projectId, body.attributeValues, id);
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    // Capture existing derivative state inside the transaction so the
    // snapshot is consistent with the re-inserted attributes/relations.
    const derivMap = await db.transaction(async (tx) => {
      await tx.delete(wordAttributeValues).where(eq(wordAttributeValues.wordId, id));
      await tx.delete(wordRelations).where(eq(wordRelations.wordId, id));
      await saveAttributeValues(tx, id, projectId, body.attributeValues);

      await tx.update(words).set({ updatedAt: new Date() }).where(eq(words.id, id));

      const existingDerivs = await tx.select().from(wordDerivatives)
        .where(eq(wordDerivatives.wordId, id));
      return new Map(existingDerivs.map(d => [d.derivativeTypeId, {
        value: d.value,
        userModified: d.userModified,
      }]));
    });

    // Re-generate outside the transaction so user-modified overrides
    // survive a regeneration failure without rolling back the attribute
    // write.
    await generateDerivatives(projectId, id, body.attributeValues, derivMap);

    const snapshot = await buildWordSnapshot(id);
    await createVersion('word', id, request.userId!, snapshot, 'updated');

    return {
      ...word,
      attributeValues: body.attributeValues,
      derivatives: await getWordDerivativesResponse(id),
      validation: { warnings: validation.warnings },
    };
  });

  app.delete(`${projectPrefix}/words/:id`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [word] = await db.update(words)
      .set({ deletedAt: new Date() })
      .where(and(eq(words.id, id), isNull(words.deletedAt)))
      .returning();

    if (!word) {
      return reply.status(404).send({ error: 'Word not found' });
    }

    const snapshot = await buildWordSnapshot(id);
    await createVersion('word', id, request.userId!, snapshot, 'deleted');

    return { success: true };
  });

  app.get(`${projectPrefix}/words/:id/derivatives`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return await getWordDerivativesResponse(id);
  });

  app.patch(`${projectPrefix}/words/:id/derivatives/:derivativeTypeId`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { id, derivativeTypeId } = request.params as { id: string; derivativeTypeId: string };
    const { value } = request.body as { value: string };

    const existing = await db.query.wordDerivatives.findFirst({
      where: and(
        eq(wordDerivatives.wordId, id),
        eq(wordDerivatives.derivativeTypeId, derivativeTypeId),
      ),
    });

    if (existing) {
      await db.update(wordDerivatives)
        .set({ value, userModified: true })
        .where(eq(wordDerivatives.id, existing.id));
    } else {
      await db.insert(wordDerivatives).values({
        wordId: id,
        derivativeTypeId,
        value,
        autoValue: null,
        userModified: true,
      });
    }

    const snapshot = await buildWordSnapshot(id);
    await createVersion('word', id, request.userId!, snapshot, 'updated');

    return { success: true, value, userModified: true };
  });

  app.delete(`${projectPrefix}/words/:id/derivatives/:derivativeTypeId/override`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { id, derivativeTypeId } = request.params as { id: string; derivativeTypeId: string };

    const existing = await db.query.wordDerivatives.findFirst({
      where: and(
        eq(wordDerivatives.wordId, id),
        eq(wordDerivatives.derivativeTypeId, derivativeTypeId),
      ),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Derivative not found' });
    }

    await db.update(wordDerivatives)
      .set({ value: existing.autoValue, userModified: false })
      .where(eq(wordDerivatives.id, existing.id));

    const snapshot = await buildWordSnapshot(id);
    await createVersion('word', id, request.userId!, snapshot, 'updated');

    return { success: true, value: existing.autoValue, userModified: false };
  });

  app.get(`${projectPrefix}/words/:id/versions`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const history = await getVersionHistory('word', id);
    return { items: history };
  });

  app.get(`${projectPrefix}/words/:id/versions/:versionId`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const version = await getVersionById(versionId);
    if (!version) {
      return reply.status(404).send({ error: 'Version not found' });
    }
    return version;
  });

  app.post(`${projectPrefix}/words/:id/versions/:versionId/restore`, {
    schema: { tags: ['Words'] },
    preHandler: [await requireProjectAccess('editor')],
  }, async (request, reply) => {
    const { projectId, id, versionId } = request.params as {
      projectId: string; id: string; versionId: string;
    };

    const version = await getVersionById(versionId);
    if (!version || version.entityId !== id) {
      return reply.status(404).send({ error: 'Version not found' });
    }

    const snapshot = version.snapshot as {
      attributeValues?: Record<string, unknown>;
      derivatives?: Array<{ derivativeTypeId: string; value: string | null; userModified: boolean }>;
    };

    const derivMap = await db.transaction(async (tx) => {
      await tx.delete(wordAttributeValues).where(eq(wordAttributeValues.wordId, id));
      await tx.delete(wordRelations).where(eq(wordRelations.wordId, id));
      await tx.delete(wordDerivatives).where(eq(wordDerivatives.wordId, id));

      if (snapshot.attributeValues) {
        await saveAttributeValues(tx, id, projectId, snapshot.attributeValues);
      }

      const snapshotDerivs = Array.isArray(snapshot.derivatives) ? snapshot.derivatives : [];

      const map = new Map<string, { value: string | null; userModified: boolean }>();
      for (const d of snapshotDerivs) {
        map.set(d.derivativeTypeId, { value: d.value, userModified: d.userModified });
      }
      return map;
    });

    if (snapshot.attributeValues) {
      await generateDerivatives(projectId, id, snapshot.attributeValues, derivMap);
    }

    const newSnapshot = await buildWordSnapshot(id);
    await createVersion('word', id, request.userId!, newSnapshot, 'updated');

    return { success: true, restoredTo: version.versionNumber };
  });
}

/** Accepts either the top-level `db` or a transaction `tx` — both expose
 *  the same `select` / `insert` methods we need. */
type DbExecutor = Pick<typeof db, 'select' | 'insert'>;

async function saveAttributeValues(
  executor: DbExecutor, wordId: string, projectId: string, attrValues: Record<string, unknown>,
) {
  const allAttrs = await executor.select()
    .from(attributes)
    .where(and(eq(attributes.projectId, projectId), isNull(attributes.deletedAt)));

  for (const attr of allAttrs) {
    const value = attrValues[attr.identifier];
    if (value === undefined || value === null) continue;

    if (attr.type === 'single_relation') {
      await executor.insert(wordRelations).values({
        wordId, attributeId: attr.id, relatedWordId: value as string,
      });
    } else if (attr.type === 'multiple_relation') {
      const ids = value as string[];
      for (const relId of ids) {
        await executor.insert(wordRelations).values({
          wordId, attributeId: attr.id, relatedWordId: relId,
        });
      }
    } else {
      const row: typeof wordAttributeValues.$inferInsert = { wordId, attributeId: attr.id };
      switch (attr.type) {
        case 'string': row.stringValue = String(value); break;
        case 'one_of': row.oneOfValue = String(value); break;
        case 'integer': row.integerValue = Number(value); break;
        case 'boolean': row.booleanValue = Boolean(value); break;
      }
      await executor.insert(wordAttributeValues).values(row);
    }
  }
}

async function getWordDerivativesResponse(wordId: string) {
  const derivs = await db.select({
    derivativeTypeId: wordDerivatives.derivativeTypeId,
    value: wordDerivatives.value,
    autoValue: wordDerivatives.autoValue,
    userModified: wordDerivatives.userModified,
    typeName: derivativeTypes.name,
    typeIdentifier: derivativeTypes.identifier,
  })
    .from(wordDerivatives)
    .innerJoin(derivativeTypes, eq(wordDerivatives.derivativeTypeId, derivativeTypes.id))
    .where(eq(wordDerivatives.wordId, wordId));

  return derivs.map(d => ({
    derivativeTypeId: d.derivativeTypeId,
    name: d.typeName,
    identifier: d.typeIdentifier,
    value: d.value,
    autoValue: d.autoValue,
    userModified: d.userModified,
    // camelCase alias the frontend expects
    isUserModified: d.userModified,
    suggestedValue: d.userModified && d.autoValue !== d.value ? d.autoValue : null,
  }));
}

async function getWordRelationsResponse(wordId: string) {
  const rels = await db.select({
    attributeId: wordRelations.attributeId,
    relatedWordId: wordRelations.relatedWordId,
  })
    .from(wordRelations)
    .where(eq(wordRelations.wordId, wordId));

  return rels;
}
