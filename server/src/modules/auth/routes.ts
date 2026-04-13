import type { FastifyInstance } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { users, apiKeys, projectMembers } from '../../db/schema/index.js';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../../middleware/auth.js';
import { generateApiKey } from '../../utils/api-key.js';

const VALID_PROJECT_ROLES = ['viewer', 'editor', 'project_admin'] as const;
type ProjectRole = typeof VALID_PROJECT_ROLES[number];

// A valid bcrypt hash of a placeholder string. Used to equalize timing between
// the "user not found" and "wrong password" branches of login, so an attacker
// can't probe which emails exist based on response latency.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-equalizer', 10);

export async function authRoutes(app: FastifyInstance) {
  app.get('/api/v1/auth/setup-status', {
    schema: { tags: ['Auth'] },
  }, async () => {
    const userCount = await db.select().from(users).limit(1);
    return { needsSetup: userCount.length === 0 };
  });

  // Wrapped in a transaction to prevent TOCTOU race where two concurrent
  // requests both see zero users and both try to insert an admin.
  app.post('/api/v1/auth/setup', {
    schema: { tags: ['Auth'] },
  }, async (request, reply) => {
    const { email, displayName, password } = request.body as {
      email: string; displayName: string; password: string;
    };

    if (!email || !displayName || !password) {
      return reply.status(400).send({ error: 'Email, display name, and password are required' });
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const user = await db.transaction(async (tx) => {
        const userCount = await tx.select().from(users).limit(1);
        if (userCount.length > 0) {
          throw new Error('SETUP_ALREADY_COMPLETE');
        }

        const [created] = await tx.insert(users).values({
          email,
          displayName,
          passwordHash,
          role: 'instance_admin',
        }).returning();

        return created;
      });

      const session = request.session;
      if (session) session.userId = user.id;

      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      // Handle both our explicit check and a DB unique-constraint race
      if (message === 'SETUP_ALREADY_COMPLETE' || message.includes('unique') || message.includes('duplicate')) {
        return reply.status(400).send({ error: 'Setup already completed' });
      }
      throw err;
    }
  });

  app.post('/api/v1/auth/login', {
    schema: { tags: ['Auth'] },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const user = await db.query.users.findFirst({
      where: and(eq(users.email, email), isNull(users.deletedAt)),
    });

    // Always run bcrypt.compare so response time doesn't reveal whether the
    // email exists. When the user is missing, compare against a dummy hash.
    const hashToCheck = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordMatches = await bcrypt.compare(password, hashToCheck);

    if (!user || !passwordMatches) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const session = request.session;
    if (session) session.userId = user.id;

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  });

  // Awaits the session destroy callback so the Redis record is removed
  // before the 200 response goes out — otherwise the session stays valid
  // for subsequent /auth/me calls while destroy() is still in-flight.
  app.post('/api/v1/auth/logout', {
    schema: { tags: ['Auth'] },
  }, async (request, reply) => {
    const session = request.session;
    if (!session || typeof session.destroy !== 'function') {
      return { success: true };
    }
    await new Promise<void>((resolve, reject) => {
      session.destroy((err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    // Clear the cookie client-side as well so it can't be reused.
    reply.clearCookie('sessionId', { path: '/' });
    return { success: true };
  });

  app.get('/api/v1/auth/me', {
    schema: { tags: ['Auth'] },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    if (!request.userId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    const user = await db.query.users.findFirst({
      where: eq(users.id, request.userId),
    });
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  });

  app.patch('/api/v1/auth/profile', {
    schema: { tags: ['Auth'] },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as {
      displayName?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const user = await db.query.users.findFirst({
      where: eq(users.id, request.userId!),
    });
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const setValues: Record<string, unknown> = { updatedAt: new Date() };

    if (body.displayName !== undefined) {
      if (!body.displayName.trim()) {
        return reply.status(400).send({ error: 'Display name cannot be empty' });
      }
      setValues.displayName = body.displayName.trim();
    }

    if (body.newPassword) {
      if (!body.currentPassword) {
        return reply.status(400).send({ error: 'Current password is required to set a new one' });
      }
      const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!valid) {
        return reply.status(400).send({ error: 'Current password is incorrect' });
      }
      if (body.newPassword.length < 8) {
        return reply.status(400).send({ error: 'New password must be at least 8 characters' });
      }
      setValues.passwordHash = await bcrypt.hash(body.newPassword, 12);
    }

    const [updated] = await db.update(users)
      .set(setValues)
      .where(eq(users.id, request.userId!))
      .returning();

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
    };
  });

  // When projectId/role are set, the middleware enforces them on every
  // request and the key is capped at that scope even if the owning user
  // has broader permissions. An unscoped key acts with the user's full
  // permissions.
  app.post('/api/v1/auth/api-keys', {
    schema: { tags: ['Auth'] },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { name, projectId, role } = request.body as {
      name: string;
      projectId?: string | null;
      role?: string | null;
    };

    if (!name || typeof name !== 'string') {
      return reply.status(400).send({ error: 'Name is required' });
    }

    if ((projectId && !role) || (role && !projectId)) {
      return reply.status(400).send({
        error: 'projectId and role must be provided together, or both omitted',
      });
    }

    if (role && !VALID_PROJECT_ROLES.includes(role as ProjectRole)) {
      return reply.status(400).send({ error: 'Invalid role' });
    }

    if (projectId) {
      const membership = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, request.userId!),
        ),
      });
      if (!membership && request.userRole !== 'instance_admin') {
        return reply.status(403).send({ error: 'No access to this project' });
      }
    }

    const { rawKey, keyHash, keyPrefix } = generateApiKey();

    const [key] = await db.insert(apiKeys).values({
      userId: request.userId!,
      name,
      keyHash,
      keyPrefix,
      projectId: projectId ?? null,
      role: (role as ProjectRole) ?? null,
    }).returning();

    return {
      id: key.id,
      name: key.name,
      key: rawKey, // Only returned once at creation
      prefix: keyPrefix,
      projectId: key.projectId,
      role: key.role,
      createdAt: key.createdAt,
    };
  });

  app.get('/api/v1/auth/api-keys', {
    schema: { tags: ['Auth'] },
    preHandler: [requireAuth],
  }, async (request) => {
    const keys = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      projectId: apiKeys.projectId,
      role: apiKeys.role,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    }).from(apiKeys).where(eq(apiKeys.userId, request.userId!));

    return keys;
  });

  app.delete('/api/v1/auth/api-keys/:id', {
    schema: { tags: ['Auth'] },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [key] = await db.delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, request.userId!)))
      .returning();

    if (!key) {
      return reply.status(404).send({ error: 'API key not found' });
    }

    return { success: true };
  });
}
