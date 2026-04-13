import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { wordRuleLinks, rules } from '../../db/schema/index.js';
import { requireProjectAccess } from '../../middleware/auth.js';

export async function wordRuleLinkRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  // List word rule links for a project, joined with rule metadata,
  // ordered by displayOrder.
  app.get(`${projectPrefix}/word-rules`, {
    schema: { tags: ['Word Rules'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };

    const items = await db
      .select({
        id: wordRuleLinks.id,
        ruleId: wordRuleLinks.ruleId,
        required: wordRuleLinks.required,
        displayOrder: wordRuleLinks.displayOrder,
        createdAt: wordRuleLinks.createdAt,
        ruleName: rules.name,
        ruleEnabled: rules.enabled,
        ruleDescription: rules.description,
      })
      .from(wordRuleLinks)
      .innerJoin(rules, eq(wordRuleLinks.ruleId, rules.id))
      .where(and(
        eq(wordRuleLinks.projectId, projectId),
        isNull(rules.deletedAt),
      ))
      .orderBy(asc(wordRuleLinks.displayOrder));

    return { items };
  });

  // Link an existing library rule as a word rule.
  app.post(`${projectPrefix}/word-rules`, {
    schema: { tags: ['Word Rules'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      ruleId: string;
      required?: boolean;
      displayOrder?: number;
    };

    if (!body.ruleId) {
      return reply.status(400).send({ error: 'ruleId is required' });
    }

    // Verify the rule exists and belongs to this project
    const rule = await db.query.rules.findFirst({
      where: and(
        eq(rules.id, body.ruleId),
        eq(rules.projectId, projectId),
        isNull(rules.deletedAt),
      ),
    });
    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found in this project' });
    }

    // Reject duplicate links
    const existing = await db.query.wordRuleLinks.findFirst({
      where: and(
        eq(wordRuleLinks.projectId, projectId),
        eq(wordRuleLinks.ruleId, body.ruleId),
      ),
    });
    if (existing) {
      return reply.status(409).send({ error: 'This rule is already linked as a word rule' });
    }

    // Pick displayOrder — append to the end unless explicitly provided
    let displayOrder = body.displayOrder;
    if (displayOrder === undefined) {
      const all = await db.select({ displayOrder: wordRuleLinks.displayOrder })
        .from(wordRuleLinks)
        .where(eq(wordRuleLinks.projectId, projectId));
      displayOrder = all.length > 0 ? Math.max(...all.map(a => a.displayOrder)) + 1 : 0;
    }

    const [link] = await db.insert(wordRuleLinks).values({
      projectId,
      ruleId: body.ruleId,
      required: body.required ?? true,
      displayOrder,
    }).returning();

    return link;
  });

  // Update a word rule link (required flag and/or displayOrder).
  app.patch(`${projectPrefix}/word-rules/:linkId`, {
    schema: { tags: ['Word Rules'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, linkId } = request.params as { projectId: string; linkId: string };
    const body = request.body as { required?: boolean; displayOrder?: number };

    const setValues: Record<string, unknown> = {};
    if (body.required !== undefined) setValues.required = body.required;
    if (body.displayOrder !== undefined) setValues.displayOrder = body.displayOrder;

    if (Object.keys(setValues).length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    const [updated] = await db.update(wordRuleLinks)
      .set(setValues)
      .where(and(eq(wordRuleLinks.id, linkId), eq(wordRuleLinks.projectId, projectId)))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Word rule link not found' });
    }

    return updated;
  });

  // Reorder all word rules at once — body is an ordered array of linkIds.
  app.put(`${projectPrefix}/word-rules/order`, {
    schema: { tags: ['Word Rules'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { linkIds } = request.body as { linkIds: string[] };
    if (!Array.isArray(linkIds)) {
      return reply.status(400).send({ error: 'linkIds must be an array' });
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < linkIds.length; i++) {
        await tx.update(wordRuleLinks)
          .set({ displayOrder: i })
          .where(and(
            eq(wordRuleLinks.id, linkIds[i]),
            eq(wordRuleLinks.projectId, projectId),
          ));
      }
    });

    return { success: true };
  });

  // Unlink a word rule (doesn't delete the underlying rule).
  app.delete(`${projectPrefix}/word-rules/:linkId`, {
    schema: { tags: ['Word Rules'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, linkId } = request.params as { projectId: string; linkId: string };

    const [deleted] = await db.delete(wordRuleLinks)
      .where(and(eq(wordRuleLinks.id, linkId), eq(wordRuleLinks.projectId, projectId)))
      .returning();

    if (!deleted) {
      return reply.status(404).send({ error: 'Word rule link not found' });
    }

    return { success: true };
  });
}
