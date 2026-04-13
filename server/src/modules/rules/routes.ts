import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
  rules,
  wordRuleLinks,
  derivativeTypeRuleLinks,
  derivativeTypes,
} from '../../db/schema/index.js';
import { requireProjectAccess } from '../../middleware/auth.js';
import { createVersion, getVersionHistory } from '../versioning/service.js';
import { executeRule } from '../node-engine/index.js';
import { loadVariablesMap } from '../words/service.js';
import type { ExecutionContext, NodeGraph } from '../node-engine/types.js';
import { validateGraphSize } from '../../utils/graph-validator.js';

/** Collect usage info for a set of rules (word rule? which derivative
 * types reference it?). Bulk version used by list endpoint. */
async function buildUsageMap(projectId: string, ruleIds: string[]) {
  const usage = new Map<
    string,
    {
      asWordRule: { linkId: string; required: boolean; displayOrder: number } | null;
      derivativeTypes: Array<{ id: string; name: string; required: boolean; displayOrder: number }>;
    }
  >();
  for (const id of ruleIds) usage.set(id, { asWordRule: null, derivativeTypes: [] });

  if (ruleIds.length === 0) return usage;

  const wordLinks = await db
    .select({
      ruleId: wordRuleLinks.ruleId,
      linkId: wordRuleLinks.id,
      required: wordRuleLinks.required,
      displayOrder: wordRuleLinks.displayOrder,
    })
    .from(wordRuleLinks)
    .where(and(
      eq(wordRuleLinks.projectId, projectId),
      inArray(wordRuleLinks.ruleId, ruleIds),
    ));

  for (const link of wordLinks) {
    const entry = usage.get(link.ruleId);
    if (entry) {
      entry.asWordRule = {
        linkId: link.linkId,
        required: link.required,
        displayOrder: link.displayOrder,
      };
    }
  }

  const dtLinks = await db
    .select({
      ruleId: derivativeTypeRuleLinks.ruleId,
      derivativeTypeId: derivativeTypeRuleLinks.derivativeTypeId,
      derivativeTypeName: derivativeTypes.name,
      required: derivativeTypeRuleLinks.required,
      displayOrder: derivativeTypeRuleLinks.displayOrder,
    })
    .from(derivativeTypeRuleLinks)
    .innerJoin(
      derivativeTypes,
      eq(derivativeTypeRuleLinks.derivativeTypeId, derivativeTypes.id),
    )
    .where(and(
      inArray(derivativeTypeRuleLinks.ruleId, ruleIds),
      isNull(derivativeTypes.deletedAt),
    ));

  for (const link of dtLinks) {
    const entry = usage.get(link.ruleId);
    if (entry) {
      entry.derivativeTypes.push({
        id: link.derivativeTypeId,
        name: link.derivativeTypeName,
        required: link.required,
        displayOrder: link.displayOrder,
      });
    }
  }

  return usage;
}

export async function ruleRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  // List rules with usage info
  app.get(`${projectPrefix}/rules`, {
    schema: { tags: ['Rules'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };

    const allRules = await db.select()
      .from(rules)
      .where(and(eq(rules.projectId, projectId), isNull(rules.deletedAt)))
      .orderBy(asc(rules.name));

    const usage = await buildUsageMap(projectId, allRules.map(r => r.id));

    const items = allRules.map(r => ({
      ...r,
      usage: usage.get(r.id) ?? { asWordRule: null, derivativeTypes: [] },
    }));

    return { items };
  });

  // Create rule
  app.post(`${projectPrefix}/rules`, {
    schema: { tags: ['Rules'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      name: string;
      description?: string;
      enabled?: boolean;
      graph: NodeGraph;
    };

    if (!body.name || !body.graph) {
      return reply.status(400).send({ error: 'Name and graph are required' });
    }

    const sizeCheck = validateGraphSize(body.graph);
    if (!sizeCheck.ok) {
      return reply.status(400).send({ error: sizeCheck.error });
    }

    const [rule] = await db.insert(rules).values({
      projectId,
      name: body.name,
      description: body.description || null,
      enabled: body.enabled ?? true,
      graph: body.graph,
    }).returning();

    await createVersion('rule', rule.id, request.userId!, { ...rule }, 'created');

    return { ...rule, usage: { asWordRule: null, derivativeTypes: [] } };
  });

  // Get rule (with usage)
  app.get(`${projectPrefix}/rules/:id`, {
    schema: { tags: ['Rules'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { id } = request.params as { id: string };

    const rule = await db.query.rules.findFirst({
      where: and(eq(rules.id, id), eq(rules.projectId, projectId), isNull(rules.deletedAt)),
    });

    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }

    const usage = await buildUsageMap(projectId, [id]);
    return { ...rule, usage: usage.get(id) ?? { asWordRule: null, derivativeTypes: [] } };
  });

  // Update rule
  app.put(`${projectPrefix}/rules/:id`, {
    schema: { tags: ['Rules'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const body = request.body as {
      name?: string;
      description?: string | null;
      enabled?: boolean;
      graph?: NodeGraph;
    };

    const existing = await db.query.rules.findFirst({
      where: and(eq(rules.id, id), eq(rules.projectId, projectId), isNull(rules.deletedAt)),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Rule not found' });
    }

    if (body.graph !== undefined) {
      const sizeCheck = validateGraphSize(body.graph);
      if (!sizeCheck.ok) {
        return reply.status(400).send({ error: sizeCheck.error });
      }
    }

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) setValues.name = body.name;
    if (body.description !== undefined) setValues.description = body.description;
    if (body.enabled !== undefined) setValues.enabled = body.enabled;
    if (body.graph !== undefined) setValues.graph = body.graph;

    const [updated] = await db.update(rules).set(setValues).where(eq(rules.id, id)).returning();

    await createVersion('rule', id, request.userId!, { ...updated }, 'updated');

    return updated;
  });

  // Delete rule (cascades to link tables via FK)
  app.delete(`${projectPrefix}/rules/:id`, {
    schema: { tags: ['Rules'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const [rule] = await db.update(rules)
      .set({ deletedAt: new Date() })
      .where(and(eq(rules.id, id), eq(rules.projectId, projectId), isNull(rules.deletedAt)))
      .returning();

    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }

    await createVersion('rule', id, request.userId!, { ...rule }, 'deleted');

    return { success: true };
  });

  // Test rule
  app.post(`${projectPrefix}/rules/:id/test`, {
    schema: { tags: ['Rules'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const { attributeValues } = request.body as { attributeValues: Record<string, unknown> };

    const rule = await db.query.rules.findFirst({
      where: and(eq(rules.id, id), eq(rules.projectId, projectId), isNull(rules.deletedAt)),
    });

    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }

    const variablesMap = await loadVariablesMap(projectId);

    const context: ExecutionContext = {
      attributeValues,
      variables: variablesMap,
    };

    const result = executeRule(rule.graph as NodeGraph, context);

    return result;
  });

  // Version history
  app.get(`${projectPrefix}/rules/:id/versions`, {
    schema: { tags: ['Rules'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const rule = await db.query.rules.findFirst({
      where: and(eq(rules.id, id), eq(rules.projectId, projectId), isNull(rules.deletedAt)),
    });
    if (!rule) {
      return reply.status(404).send({ error: 'Rule not found' });
    }

    const history = await getVersionHistory('rule', id);
    return { items: history };
  });
}
