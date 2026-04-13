import type { FastifyInstance } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { builders, derivativeTypes } from '../../db/schema/index.js';
import { requireProjectAccess } from '../../middleware/auth.js';
import { createVersion, getVersionHistory } from '../versioning/service.js';
import { executeBuilder } from '../node-engine/index.js';
import { regenerateProjectDerivatives, loadVariablesMap } from '../words/service.js';
import type { ExecutionContext, NodeGraph } from '../node-engine/types.js';
import { validateGraphSize } from '../../utils/graph-validator.js';

export async function builderRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  // List builders
  app.get(`${projectPrefix}/builders`, {
    schema: { tags: ['Builders'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };

    const allBuilders = await db.select()
      .from(builders)
      .where(and(eq(builders.projectId, projectId), isNull(builders.deletedAt)));

    return { items: allBuilders };
  });

  // Create builder
  app.post(`${projectPrefix}/builders`, {
    schema: { tags: ['Builders'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as { name: string; graph: NodeGraph };

    if (!body.name || !body.graph) {
      return reply.status(400).send({ error: 'Name and graph are required' });
    }

    const sizeCheck = validateGraphSize(body.graph);
    if (!sizeCheck.ok) {
      return reply.status(400).send({ error: sizeCheck.error });
    }

    const [builder] = await db.insert(builders).values({
      projectId,
      name: body.name,
      graph: body.graph,
    }).returning();

    await createVersion('builder', builder.id, request.userId!, { ...builder }, 'created');

    return builder;
  });

  // Get builder
  app.get(`${projectPrefix}/builders/:id`, {
    schema: { tags: ['Builders'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const builder = await db.query.builders.findFirst({
      where: and(eq(builders.id, id), eq(builders.projectId, projectId), isNull(builders.deletedAt)),
    });

    if (!builder) {
      return reply.status(404).send({ error: 'Builder not found' });
    }

    return builder;
  });

  // Update builder
  app.put(`${projectPrefix}/builders/:id`, {
    schema: { tags: ['Builders'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const body = request.body as { name?: string; graph?: NodeGraph };

    const existing = await db.query.builders.findFirst({
      where: and(eq(builders.id, id), eq(builders.projectId, projectId), isNull(builders.deletedAt)),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Builder not found' });
    }

    if (body.graph !== undefined) {
      const sizeCheck = validateGraphSize(body.graph);
      if (!sizeCheck.ok) {
        return reply.status(400).send({ error: sizeCheck.error });
      }
    }

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) setValues.name = body.name;
    if (body.graph !== undefined) setValues.graph = body.graph;

    const [updated] = await db.update(builders).set(setValues).where(eq(builders.id, id)).returning();

    await createVersion('builder', id, request.userId!, { ...updated }, 'updated');

    // Cascade: if the graph changed, regenerate derivatives for every
    // project that has a derivative type pointing at this builder.
    if (body.graph !== undefined) {
      const affectedTypes = await db.select()
        .from(derivativeTypes)
        .where(and(
          eq(derivativeTypes.builderId, id),
          isNull(derivativeTypes.deletedAt),
        ));
      const projectIds = new Set(affectedTypes.map(t => t.projectId));
      for (const pid of projectIds) {
        await regenerateProjectDerivatives(pid, request.userId!);
      }
    }

    return updated;
  });

  // Delete builder
  app.delete(`${projectPrefix}/builders/:id`, {
    schema: { tags: ['Builders'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const [builder] = await db.update(builders)
      .set({ deletedAt: new Date() })
      .where(and(eq(builders.id, id), eq(builders.projectId, projectId), isNull(builders.deletedAt)))
      .returning();

    if (!builder) {
      return reply.status(404).send({ error: 'Builder not found' });
    }

    await createVersion('builder', id, request.userId!, { ...builder }, 'deleted');

    // Cascade: regenerate derivatives for every project that had a
    // derivative type pointing at this now-deleted builder.
    const affectedTypes = await db.select()
      .from(derivativeTypes)
      .where(and(
        eq(derivativeTypes.builderId, id),
        isNull(derivativeTypes.deletedAt),
      ));
    const projectIds = new Set(affectedTypes.map(t => t.projectId));
    for (const pid of projectIds) {
      await regenerateProjectDerivatives(pid, request.userId!);
    }

    return { success: true };
  });

  // Test builder
  app.post(`${projectPrefix}/builders/:id/test`, {
    schema: { tags: ['Builders'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const { attributeValues, derivativeValues } = request.body as {
      attributeValues: Record<string, unknown>;
      derivativeValues?: Record<string, string | null>;
    };

    const builder = await db.query.builders.findFirst({
      where: and(eq(builders.id, id), eq(builders.projectId, projectId), isNull(builders.deletedAt)),
    });

    if (!builder) {
      return reply.status(404).send({ error: 'Builder not found' });
    }

    // Load variables
    const variablesMap = await loadVariablesMap(projectId);

    const context: ExecutionContext = {
      attributeValues,
      derivativeValues,
      variables: variablesMap,
    };

    const result = executeBuilder(builder.graph as NodeGraph, context);

    return result;
  });

  // Version history
  app.get(`${projectPrefix}/builders/:id/versions`, {
    schema: { tags: ['Builders'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const exists = await db.query.builders.findFirst({
      where: and(eq(builders.id, id), eq(builders.projectId, projectId), isNull(builders.deletedAt)),
    });

    if (!exists) {
      return reply.status(404).send({ error: 'Builder not found' });
    }

    const history = await getVersionHistory('builder', id);
    return { items: history };
  });
}
