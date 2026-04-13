import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  derivativeTypes,
  derivativeTypeDependencies,
  derivativeTypeRuleLinks,
  rules,
  builders,
} from '../../db/schema/index.js';
import { requireProjectAccess } from '../../middleware/auth.js';
import { createVersion, getVersionHistory } from '../versioning/service.js';
import { regenerateProjectDerivatives } from '../words/service.js';

export async function derivativeTypeRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  // List derivative types with enriched metadata
  app.get(`${projectPrefix}/derivative-types`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };

    const types = await db.select()
      .from(derivativeTypes)
      .where(and(eq(derivativeTypes.projectId, projectId), isNull(derivativeTypes.deletedAt)));

    const items = await Promise.all(types.map((dtype) => getFullDerivativeType(dtype.id, projectId)));
    return { items: items.filter(Boolean) };
  });

  // Create derivative type
  app.post(`${projectPrefix}/derivative-types`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      name: string; identifier: string; required?: boolean;
      builderId?: string; dependencies?: string[];
    };

    if (!body.name || !body.identifier) {
      return reply.status(400).send({ error: 'Name and identifier are required' });
    }

    if (body.dependencies && body.dependencies.length > 0) {
      const hasCycle = await checkCircularDependencies(null, body.dependencies);
      if (hasCycle) {
        return reply.status(400).send({ error: 'Circular dependency detected' });
      }
    }

    const dtype = await db.transaction(async (tx) => {
      const [created] = await tx.insert(derivativeTypes).values({
        projectId,
        name: body.name,
        identifier: body.identifier,
        required: body.required ?? false,
        builderId: body.builderId || null,
      }).returning();

      if (body.dependencies) {
        for (const depId of body.dependencies) {
          await tx.insert(derivativeTypeDependencies).values({
            derivativeTypeId: created.id,
            dependsOnId: depId,
          });
        }
      }
      return created;
    });

    await createVersion('derivative_type', dtype.id, request.userId!, { ...dtype }, 'created');

    // Cascade: generate the new derivative for all applicable words
    await regenerateProjectDerivatives(projectId, request.userId!);

    return await getFullDerivativeType(dtype.id, projectId);
  });

  // Get derivative type
  app.get(`${projectPrefix}/derivative-types/:id`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const dtype = await db.query.derivativeTypes.findFirst({
      where: and(eq(derivativeTypes.id, id), eq(derivativeTypes.projectId, projectId), isNull(derivativeTypes.deletedAt)),
    });
    if (!dtype) {
      return reply.status(404).send({ error: 'Derivative type not found' });
    }

    const result = await getFullDerivativeType(id, projectId);
    if (!result) {
      return reply.status(404).send({ error: 'Derivative type not found' });
    }
    return result;
  });

  // Update derivative type
  app.put(`${projectPrefix}/derivative-types/:id`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const body = request.body as {
      name?: string; identifier?: string; required?: boolean;
      builderId?: string | null; dependencies?: string[];
    };

    const existing = await db.query.derivativeTypes.findFirst({
      where: and(eq(derivativeTypes.id, id), eq(derivativeTypes.projectId, projectId), isNull(derivativeTypes.deletedAt)),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Derivative type not found' });
    }

    if (body.dependencies) {
      const hasCycle = await checkCircularDependencies(id, body.dependencies);
      if (hasCycle) {
        return reply.status(400).send({ error: 'Circular dependency detected' });
      }
    }

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) setValues.name = body.name;
    if (body.identifier !== undefined) setValues.identifier = body.identifier;
    if (body.required !== undefined) setValues.required = body.required;
    if (body.builderId !== undefined) setValues.builderId = body.builderId;

    await db.update(derivativeTypes).set(setValues).where(eq(derivativeTypes.id, id));

    if (body.dependencies !== undefined) {
      await db.delete(derivativeTypeDependencies)
        .where(eq(derivativeTypeDependencies.derivativeTypeId, id));
      for (const depId of body.dependencies) {
        await db.insert(derivativeTypeDependencies).values({
          derivativeTypeId: id,
          dependsOnId: depId,
        });
      }
    }

    const result = await getFullDerivativeType(id, projectId);
    await createVersion('derivative_type', id, request.userId!, { ...result }, 'updated');

    // Cascade: regenerate derivatives for all words in the project
    const dtype = await db.query.derivativeTypes.findFirst({
      where: eq(derivativeTypes.id, id),
    });
    if (dtype) {
      await regenerateProjectDerivatives(dtype.projectId, request.userId!);
    }

    return result;
  });

  // Delete derivative type
  app.delete(`${projectPrefix}/derivative-types/:id`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const [dtype] = await db.update(derivativeTypes)
      .set({ deletedAt: new Date() })
      .where(and(eq(derivativeTypes.id, id), eq(derivativeTypes.projectId, projectId), isNull(derivativeTypes.deletedAt)))
      .returning();

    if (!dtype) {
      return reply.status(404).send({ error: 'Derivative type not found' });
    }

    await createVersion('derivative_type', id, request.userId!, { ...dtype }, 'deleted');

    // Cascade: regenerate derivatives now that this type is soft-deleted
    await regenerateProjectDerivatives(dtype.projectId, request.userId!);

    return { success: true };
  });

  // Version history
  app.get(`${projectPrefix}/derivative-types/:id/versions`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const history = await getVersionHistory('derivative_type', id);
    return { items: history };
  });

  // List applicability rule links for a derivative type
  app.get(`${projectPrefix}/derivative-types/:id/applicability-rules`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const items = await db
      .select({
        id: derivativeTypeRuleLinks.id,
        ruleId: derivativeTypeRuleLinks.ruleId,
        required: derivativeTypeRuleLinks.required,
        displayOrder: derivativeTypeRuleLinks.displayOrder,
        ruleName: rules.name,
        ruleEnabled: rules.enabled,
      })
      .from(derivativeTypeRuleLinks)
      .innerJoin(rules, eq(derivativeTypeRuleLinks.ruleId, rules.id))
      .where(and(
        eq(derivativeTypeRuleLinks.derivativeTypeId, id),
        isNull(rules.deletedAt),
      ))
      .orderBy(asc(derivativeTypeRuleLinks.displayOrder));
    return { items };
  });

  // Link a library rule to a derivative type as an applicability check.
  app.post(`${projectPrefix}/derivative-types/:id/applicability-rules`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const body = request.body as {
      ruleId: string;
      required?: boolean;
      displayOrder?: number;
    };

    if (!body.ruleId) {
      return reply.status(400).send({ error: 'ruleId is required' });
    }

    // Ensure the derivative type belongs to this project
    const dtype = await db.query.derivativeTypes.findFirst({
      where: and(
        eq(derivativeTypes.id, id),
        eq(derivativeTypes.projectId, projectId),
        isNull(derivativeTypes.deletedAt),
      ),
    });
    if (!dtype) {
      return reply.status(404).send({ error: 'Derivative type not found' });
    }

    // Ensure the rule exists and belongs to the same project
    const rule = await db.query.rules.findFirst({
      where: and(
        eq(rules.id, body.ruleId),
        eq(rules.projectId, projectId),
        isNull(rules.deletedAt),
      ),
    });
    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }

    // Reject duplicate link
    const existing = await db.query.derivativeTypeRuleLinks.findFirst({
      where: and(
        eq(derivativeTypeRuleLinks.derivativeTypeId, id),
        eq(derivativeTypeRuleLinks.ruleId, body.ruleId),
      ),
    });
    if (existing) {
      return reply.status(409).send({ error: 'This rule is already linked to this derivative type' });
    }

    let displayOrder = body.displayOrder;
    if (displayOrder === undefined) {
      const all = await db
        .select({ displayOrder: derivativeTypeRuleLinks.displayOrder })
        .from(derivativeTypeRuleLinks)
        .where(eq(derivativeTypeRuleLinks.derivativeTypeId, id));
      displayOrder = all.length > 0 ? Math.max(...all.map(a => a.displayOrder)) + 1 : 0;
    }

    const [link] = await db.insert(derivativeTypeRuleLinks).values({
      derivativeTypeId: id,
      ruleId: body.ruleId,
      required: body.required ?? true,
      displayOrder,
    }).returning();

    // Cascade: applicability changed — regenerate
    await regenerateProjectDerivatives(dtype.projectId, request.userId!);

    return link;
  });

  // Update a link (required flag and/or displayOrder)
  app.patch(`${projectPrefix}/derivative-types/:id/applicability-rules/:linkId`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { linkId } = request.params as { linkId: string };
    const body = request.body as { required?: boolean; displayOrder?: number };

    const setValues: Record<string, unknown> = {};
    if (body.required !== undefined) setValues.required = body.required;
    if (body.displayOrder !== undefined) setValues.displayOrder = body.displayOrder;

    if (Object.keys(setValues).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const { id } = request.params as { id: string };
    const [updated] = await db.update(derivativeTypeRuleLinks)
      .set(setValues)
      .where(and(
        eq(derivativeTypeRuleLinks.id, linkId),
        eq(derivativeTypeRuleLinks.derivativeTypeId, id),
      ))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Applicability link not found' });
    }
    return updated;
  });

  // Reorder all links for a derivative type
  app.put(`${projectPrefix}/derivative-types/:id/applicability-rules/order`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { linkIds } = request.body as { linkIds: string[] };
    if (!Array.isArray(linkIds)) {
      return reply.status(400).send({ error: 'linkIds must be an array' });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < linkIds.length; i++) {
        await tx.update(derivativeTypeRuleLinks)
          .set({ displayOrder: i })
          .where(and(
            eq(derivativeTypeRuleLinks.id, linkIds[i]),
            eq(derivativeTypeRuleLinks.derivativeTypeId, id),
          ));
      }
    });
    return { success: true };
  });

  // Unlink
  app.delete(`${projectPrefix}/derivative-types/:id/applicability-rules/:linkId`, {
    schema: { tags: ['Derivative Types'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { linkId } = request.params as { linkId: string };
    const [deleted] = await db.delete(derivativeTypeRuleLinks)
      .where(and(
        eq(derivativeTypeRuleLinks.id, linkId),
        eq(derivativeTypeRuleLinks.derivativeTypeId, id),
      ))
      .returning();
    if (!deleted) {
      return reply.status(404).send({ error: 'Applicability link not found' });
    }

    // Cascade: applicability changed — regenerate
    const dtype = await db.query.derivativeTypes.findFirst({
      where: eq(derivativeTypes.id, id),
    });
    if (dtype) {
      await regenerateProjectDerivatives(dtype.projectId, request.userId!);
    }

    return { success: true };
  });
}

async function getFullDerivativeType(id: string, projectId: string) {
  const dtype = await db.query.derivativeTypes.findFirst({
    where: and(
      eq(derivativeTypes.id, id),
      eq(derivativeTypes.projectId, projectId),
      isNull(derivativeTypes.deletedAt),
    ),
  });

  if (!dtype) return null;

  const deps = await db.select()
    .from(derivativeTypeDependencies)
    .where(eq(derivativeTypeDependencies.derivativeTypeId, id));

  const dependencies = await Promise.all(deps.map(async (d) => {
    // Restrict dependency lookup to the same project so a cross-project
    // reference can't leak another tenant's derivative-type metadata.
    const target = await db.query.derivativeTypes.findFirst({
      where: and(
        eq(derivativeTypes.id, d.dependsOnId),
        eq(derivativeTypes.projectId, projectId),
        isNull(derivativeTypes.deletedAt),
      ),
    });
    return {
      derivativeTypeId: d.dependsOnId,
      derivativeTypeName: target?.name ?? '',
    };
  }));

  // Applicability rules come through the link table joined with the library.
  const appLinks = await db
    .select({
      id: derivativeTypeRuleLinks.id,
      ruleId: derivativeTypeRuleLinks.ruleId,
      required: derivativeTypeRuleLinks.required,
      displayOrder: derivativeTypeRuleLinks.displayOrder,
      ruleName: rules.name,
      ruleEnabled: rules.enabled,
    })
    .from(derivativeTypeRuleLinks)
    .innerJoin(rules, eq(derivativeTypeRuleLinks.ruleId, rules.id))
    .where(and(
      eq(derivativeTypeRuleLinks.derivativeTypeId, id),
      isNull(rules.deletedAt),
    ))
    .orderBy(asc(derivativeTypeRuleLinks.displayOrder));

  let builderName: string | undefined;
  if (dtype.builderId) {
    const b = await db.query.builders.findFirst({
      where: eq(builders.id, dtype.builderId),
    });
    builderName = b?.name;
  }

  return {
    ...dtype,
    dependencies,
    applicabilityRuleIds: appLinks.map(l => l.ruleId),
    applicabilityRules: appLinks, // { id (linkId), ruleId, ruleName, required, displayOrder, ruleEnabled }
    builderName,
  };
}

async function checkCircularDependencies(
  currentId: string | null,
  newDeps: string[],
): Promise<boolean> {
  const visited = new Set<string>();
  const stack = [...newDeps];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === currentId) return true;
    if (visited.has(id)) continue;
    visited.add(id);

    const deps = await db.select()
      .from(derivativeTypeDependencies)
      .where(eq(derivativeTypeDependencies.derivativeTypeId, id));

    for (const dep of deps) {
      stack.push(dep.dependsOnId);
    }
  }

  return false;
}
