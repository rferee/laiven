import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { variables, variableItems } from '../../db/schema/index.js';
import { requireProjectAccess } from '../../middleware/auth.js';
import { createVersion, getVersionHistory } from '../versioning/service.js';

// Frontend sends hyphens (one-of), DB enum uses underscores (one_of)
type VariableDataType = 'string' | 'one_of' | 'integer' | 'boolean';
const validDataTypes: ReadonlySet<string> = new Set<VariableDataType>(['string', 'one_of', 'integer', 'boolean']);

function normalizeDataType(dt: string): VariableDataType | null {
  const normalized = dt.replace(/-/g, '_');
  return validDataTypes.has(normalized) ? (normalized as VariableDataType) : null;
}

export async function variableRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  // List variables
  app.get(`${projectPrefix}/variables`, {
    schema: { tags: ['Variables'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };

    const vars = await db.select()
      .from(variables)
      .where(and(eq(variables.projectId, projectId), isNull(variables.deletedAt)));

    // Include items for each variable
    const varsWithItems = await Promise.all(vars.map(async (v) => {
      const items = await db.select()
        .from(variableItems)
        .where(eq(variableItems.variableId, v.id))
        .orderBy(asc(variableItems.displayOrder));
      return { ...v, items };
    }));

    return { items: varsWithItems };
  });

  // Create variable
  app.post(`${projectPrefix}/variables`, {
    schema: { tags: ['Variables'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      name: string; dataType?: string; kind?: 'constant' | 'array'; items?: Array<{ value: string }>;
    };

    if (!body.name) {
      return reply.status(400).send({ error: 'Name is required' });
    }

    const dataType = normalizeDataType(body.dataType || 'string');
    if (!dataType) {
      return reply.status(400).send({ error: `Invalid data type: ${body.dataType}` });
    }

    const [variable] = await db.insert(variables).values({
      projectId,
      name: body.name,
      kind: body.kind || 'array',
      dataType,
    }).returning();

    // Add items if provided
    if (body.items && body.items.length > 0) {
      await db.insert(variableItems).values(
        body.items.map((item, i) => ({
          variableId: variable.id,
          value: item.value,
          displayOrder: i,
        }))
      );
    }

    const items = await db.select()
      .from(variableItems)
      .where(eq(variableItems.variableId, variable.id))
      .orderBy(asc(variableItems.displayOrder));

    const result = { ...variable, items };
    await createVersion('variable', variable.id, request.userId!, { ...result }, 'created');

    return result;
  });

  // Get variable with items
  app.get(`${projectPrefix}/variables/:id`, {
    schema: { tags: ['Variables'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const variable = await db.query.variables.findFirst({
      where: and(eq(variables.id, id), eq(variables.projectId, projectId), isNull(variables.deletedAt)),
    });

    if (!variable) {
      return reply.status(404).send({ error: 'Variable not found' });
    }

    const items = await db.select()
      .from(variableItems)
      .where(eq(variableItems.variableId, id))
      .orderBy(asc(variableItems.displayOrder));

    return { ...variable, items };
  });

  // Update variable
  app.put(`${projectPrefix}/variables/:id`, {
    schema: { tags: ['Variables'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const body = request.body as {
      name?: string; dataType?: string; kind?: 'constant' | 'array'; items?: Array<{ value: string }>;
    };

    const existing = await db.query.variables.findFirst({
      where: and(eq(variables.id, id), eq(variables.projectId, projectId), isNull(variables.deletedAt)),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Variable not found' });
    }

    // Partial<typeof variables.$inferInsert> would be ideal but Drizzle's .set()
    // accepts Record<string, unknown> for dynamic field assignment.
    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) setValues.name = body.name;
    if (body.dataType) {
      const normalized = normalizeDataType(body.dataType);
      if (!normalized) {
        return reply.status(400).send({ error: `Invalid data type: ${body.dataType}` });
      }
      setValues.dataType = normalized;
    }
    if (body.kind) setValues.kind = body.kind;

    const [updated] = await db.update(variables).set(setValues).where(eq(variables.id, id)).returning();

    // Replace items if provided
    if (body.items !== undefined) {
      await db.delete(variableItems).where(eq(variableItems.variableId, id));
      if (body.items.length > 0) {
        await db.insert(variableItems).values(
          body.items.map((item, i) => ({
            variableId: id,
            value: item.value,
            displayOrder: i,
          }))
        );
      }
    }

    const items = await db.select()
      .from(variableItems)
      .where(eq(variableItems.variableId, id))
      .orderBy(asc(variableItems.displayOrder));

    const result = { ...updated, items };
    await createVersion('variable', id, request.userId!, { ...result }, 'updated');

    return result;
  });

  // Delete variable
  app.delete(`${projectPrefix}/variables/:id`, {
    schema: { tags: ['Variables'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const [variable] = await db.update(variables)
      .set({ deletedAt: new Date() })
      .where(and(eq(variables.id, id), eq(variables.projectId, projectId), isNull(variables.deletedAt)))
      .returning();

    if (!variable) {
      return reply.status(404).send({ error: 'Variable not found' });
    }

    await createVersion('variable', id, request.userId!, { ...variable }, 'deleted');

    return { success: true };
  });

  // Version history
  app.get(`${projectPrefix}/variables/:id/versions`, {
    schema: { tags: ['Variables'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    // Verify the variable belongs to this project
    const variable = await db.query.variables.findFirst({
      where: and(eq(variables.id, id), eq(variables.projectId, projectId), isNull(variables.deletedAt)),
    });

    if (!variable) {
      return reply.status(404).send({ error: 'Variable not found' });
    }

    const history = await getVersionHistory('variable', id);
    return { items: history };
  });
}
