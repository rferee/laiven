import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { attributes } from '../../db/schema/index.js';
import { requireAuth, requireProjectAccess } from '../../middleware/auth.js';
import { createVersion, getVersionHistory } from '../versioning/service.js';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// Frontend sends hyphens (one-of), DB enum uses underscores (one_of)
type AttributeType = 'string' | 'one_of' | 'integer' | 'boolean' | 'single_relation' | 'multiple_relation';
const validAttrTypes: ReadonlySet<string> = new Set<AttributeType>(['string', 'one_of', 'integer', 'boolean', 'single_relation', 'multiple_relation']);

function normalizeAttrType(type: string): AttributeType | null {
  const normalized = type.replace(/-/g, '_');
  return validAttrTypes.has(normalized) ? (normalized as AttributeType) : null;
}

function denormalizeAttrType(type: string): string {
  return type.replace(/_/g, '-');
}

export async function attributeRoutes(app: FastifyInstance) {
  const projectPrefix = '/api/v1/projects/:projectId';

  // List attributes
  app.get(`${projectPrefix}/attributes`, {
    schema: { tags: ['Attributes'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request) => {
    const { projectId } = request.params as { projectId: string };

    const attrs = await db.select()
      .from(attributes)
      .where(and(eq(attributes.projectId, projectId), isNull(attributes.deletedAt)))
      .orderBy(asc(attributes.displayOrder));

    return { items: attrs.map(a => ({ ...a, type: denormalizeAttrType(a.type) })) };
  });

  // Create attribute
  app.post(`${projectPrefix}/attributes`, {
    schema: { tags: ['Attributes'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      name: string; type: string; required?: boolean;
      uniqueMode?: 'off' | 'case_sensitive' | 'case_insensitive';
      description?: string; options?: string[];
    };

    if (!body.name || !body.type) {
      return reply.status(400).send({ error: 'Name and type are required' });
    }

    const dbType = normalizeAttrType(body.type);
    if (!dbType) {
      return reply.status(400).send({ error: `Invalid attribute type: ${body.type}` });
    }
    const identifier = slugify(body.name);

    // Check for duplicate name
    const existing = await db.query.attributes.findFirst({
      where: and(
        eq(attributes.projectId, projectId),
        eq(attributes.identifier, identifier),
        isNull(attributes.deletedAt),
      ),
    });

    if (existing) {
      return reply.status(409).send({ error: 'An attribute with this name already exists' });
    }

    // Get max display order
    const maxOrder = await db.select({ order: attributes.displayOrder })
      .from(attributes)
      .where(and(eq(attributes.projectId, projectId), isNull(attributes.deletedAt)))
      .orderBy(asc(attributes.displayOrder));
    const nextOrder = (maxOrder.length > 0 ? Math.max(...maxOrder.map(a => a.order)) : -1) + 1;

    const [attr] = await db.insert(attributes).values({
      projectId,
      name: body.name,
      identifier,
      type: dbType,
      required: body.required ?? false,
      uniqueMode: body.uniqueMode ?? 'off',
      displayOrder: nextOrder,
      description: body.description || null,
      options: dbType === 'one_of' ? (body.options ?? []) : null,
    }).returning();

    await createVersion('attribute', attr.id, request.userId!, { ...attr }, 'created');

    return { ...attr, type: denormalizeAttrType(attr.type) };
  });

  // Get attribute
  app.get(`${projectPrefix}/attributes/:id`, {
    schema: { tags: ['Attributes'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const attr = await db.query.attributes.findFirst({
      where: and(eq(attributes.id, id), eq(attributes.projectId, projectId), isNull(attributes.deletedAt)),
    });

    if (!attr) {
      return reply.status(404).send({ error: 'Attribute not found' });
    }

    return { ...attr, type: denormalizeAttrType(attr.type) };
  });

  // Update attribute
  app.put(`${projectPrefix}/attributes/:id`, {
    schema: { tags: ['Attributes'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const body = request.body as {
      name?: string; type?: string; required?: boolean;
      uniqueMode?: 'off' | 'case_sensitive' | 'case_insensitive';
      description?: string; options?: string[];
    };

    const existing = await db.query.attributes.findFirst({
      where: and(eq(attributes.id, id), eq(attributes.projectId, projectId), isNull(attributes.deletedAt)),
    });

    if (!existing) {
      return reply.status(404).send({ error: 'Attribute not found' });
    }

    // Partial<typeof attributes.$inferInsert> would be ideal but Drizzle's .set()
    // accepts Record<string, unknown> for dynamic field assignment.
    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name) {
      setValues.name = body.name;
      setValues.identifier = slugify(body.name);
    }
    if (body.type) {
      const normalized = normalizeAttrType(body.type);
      if (!normalized) {
        return reply.status(400).send({ error: `Invalid attribute type: ${body.type}` });
      }
      setValues.type = normalized;
    }
    if (body.required !== undefined) setValues.required = body.required;
    if (body.uniqueMode !== undefined) setValues.uniqueMode = body.uniqueMode;
    if (body.description !== undefined) setValues.description = body.description;
    if (body.options !== undefined) setValues.options = body.options;

    const [updated] = await db.update(attributes).set(setValues).where(eq(attributes.id, id)).returning();

    await createVersion('attribute', id, request.userId!, { ...updated }, 'updated');

    return { ...updated, type: denormalizeAttrType(updated.type) };
  });

  // Reorder attribute
  app.patch(`${projectPrefix}/attributes/:id/order`, {
    schema: { tags: ['Attributes'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const { displayOrder } = request.body as { displayOrder: number };

    const [updated] = await db.update(attributes)
      .set({ displayOrder, updatedAt: new Date() })
      .where(and(eq(attributes.id, id), eq(attributes.projectId, projectId), isNull(attributes.deletedAt)))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Attribute not found' });
    }

    return { ...updated, type: denormalizeAttrType(updated.type) };
  });

  // Delete attribute
  app.delete(`${projectPrefix}/attributes/:id`, {
    schema: { tags: ['Attributes'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    const [attr] = await db.update(attributes)
      .set({ deletedAt: new Date() })
      .where(and(eq(attributes.id, id), eq(attributes.projectId, projectId), isNull(attributes.deletedAt)))
      .returning();

    if (!attr) {
      return reply.status(404).send({ error: 'Attribute not found' });
    }

    await createVersion('attribute', id, request.userId!, { ...attr }, 'deleted');

    return { success: true };
  });

  // Version history
  app.get(`${projectPrefix}/attributes/:id/versions`, {
    schema: { tags: ['Attributes'] },
    preHandler: [await requireProjectAccess('viewer')],
  }, async (request, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };

    // Verify the attribute belongs to this project
    const attr = await db.query.attributes.findFirst({
      where: and(eq(attributes.id, id), eq(attributes.projectId, projectId), isNull(attributes.deletedAt)),
    });

    if (!attr) {
      return reply.status(404).send({ error: 'Attribute not found' });
    }

    const history = await getVersionHistory('attribute', id);
    return { items: history };
  });
}
