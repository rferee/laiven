import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, gt, ilike, or, asc, type SQL } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { users } from '../../db/schema/index.js';
import bcrypt from 'bcryptjs';
import { requireInstanceAdmin } from '../../middleware/auth.js';

const validUserRoles = ['instance_admin', 'user'] as const;
type UserRole = typeof validUserRoles[number];
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function userRoutes(app: FastifyInstance) {
  // List users with cursor-based pagination and optional case-insensitive
  // search over email and display name. The cursor is the last returned id;
  // rows are ordered by id ascending.
  app.get('/api/v1/users', {
    schema: { tags: ['Users'] },
    preHandler: [requireInstanceAdmin],
  }, async (request) => {
    const { search, cursor, limit: limitStr } = request.query as {
      search?: string; cursor?: string; limit?: string;
    };
    const limit = Math.min(parseInt(limitStr || '50'), 100);

    const conditions: SQL[] = [isNull(users.deletedAt)];
    if (cursor) conditions.push(gt(users.id, cursor));
    if (search && search.length > 0) {
      const needle = `%${search}%`;
      const match = or(ilike(users.email, needle), ilike(users.displayName, needle));
      if (match) conditions.push(match);
    }

    const results = await db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(and(...conditions))
      .orderBy(asc(users.id))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    };
  });

  // Create user
  app.post('/api/v1/users', {
    schema: { tags: ['Users'] },
    preHandler: [requireInstanceAdmin],
  }, async (request, reply) => {
    const { email, displayName, password, role } = request.body as {
      email: string; displayName: string; password: string; role?: string;
    };

    if (!email || !displayName || !password) {
      return reply.status(400).send({ error: 'Email, display name, and password are required' });
    }

    if (!emailRegex.test(email)) {
      return reply.status(400).send({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }

    if (role && !validUserRoles.includes(role as UserRole)) {
      return reply.status(400).send({ error: 'Invalid role. Must be: instance_admin or user' });
    }

    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existing) {
      return reply.status(409).send({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(users).values({
      email,
      displayName,
      passwordHash,
      role: (role as UserRole) || 'user',
    }).returning();

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    };
  });

  // Get user
  app.get('/api/v1/users/:id', {
    schema: { tags: ['Users'] },
    preHandler: [requireInstanceAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await db.query.users.findFirst({
      where: and(eq(users.id, id), isNull(users.deletedAt)),
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
    };
  });

  // Update user
  app.patch('/api/v1/users/:id', {
    schema: { tags: ['Users'] },
    preHandler: [requireInstanceAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as {
      email?: string; displayName?: string; password?: string; role?: string;
    };

    const user = await db.query.users.findFirst({
      where: and(eq(users.id, id), isNull(users.deletedAt)),
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    if (updates.email && !emailRegex.test(updates.email)) {
      return reply.status(400).send({ error: 'Invalid email format' });
    }

    if (updates.role && !validUserRoles.includes(updates.role as UserRole)) {
      return reply.status(400).send({ error: 'Invalid role. Must be: instance_admin or user' });
    }

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.email) setValues.email = updates.email;
    if (updates.displayName) setValues.displayName = updates.displayName;
    if (updates.role) setValues.role = updates.role as UserRole;
    if (updates.password) {
      if (updates.password.length < 8) {
        return reply.status(400).send({ error: 'Password must be at least 8 characters' });
      }
      setValues.passwordHash = await bcrypt.hash(updates.password, 12);
    }

    const [updated] = await db.update(users).set(setValues).where(eq(users.id, id)).returning();

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      createdAt: updated.createdAt,
    };
  });

  // Deactivate user (soft delete)
  app.delete('/api/v1/users/:id', {
    schema: { tags: ['Users'] },
    preHandler: [requireInstanceAdmin],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Don't allow deleting yourself
    if (id === request.userId) {
      return reply.status(400).send({ error: 'Cannot deactivate your own account' });
    }

    const [user] = await db.update(users)
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning();

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return { success: true };
  });
}
