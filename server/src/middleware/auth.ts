import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { users, apiKeys, projectMembers } from '../db/schema/index.js';
import { hashApiKey } from '../utils/api-key.js';

type ProjectRole = 'viewer' | 'editor' | 'project_admin';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userRole?: 'instance_admin' | 'user';
    projectRole?: ProjectRole;
    apiKeyScope?: { projectId: string | null; role: ProjectRole | null };
  }
}

// `@fastify/session` declares `request.session` on FastifyRequest itself.
// We only need to augment the session payload shape to add our `userId` field.
declare module '@fastify/session' {
  interface FastifySessionObject {
    userId?: string;
  }
}

const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  project_admin: 3,
  editor: 2,
  viewer: 1,
};

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  // Check session first
  const session = request.session;
  const sessionUserId = session?.userId;
  if (typeof sessionUserId === 'string' && sessionUserId.length > 0) {
    const user = await db.query.users.findFirst({
      where: and(eq(users.id, sessionUserId), isNull(users.deletedAt)),
    });
    if (user) {
      request.userId = user.id;
      request.userRole = user.role;
      return;
    }
  }

  // Check API key header (HMAC-SHA256 lookup, O(1) via unique key_hash)
  const apiKey = request.headers['x-api-key'] as string;
  if (apiKey) {
    const keyHash = hashApiKey(apiKey);
    const key = await db.query.apiKeys.findFirst({
      where: eq(apiKeys.keyHash, keyHash),
    });

    if (key) {
      const user = await db.query.users.findFirst({
        where: and(eq(users.id, key.userId), isNull(users.deletedAt)),
      });
      if (user) {
        request.userId = user.id;
        request.userRole = user.role;
        request.apiKeyScope = { projectId: key.projectId, role: key.role };

        // Update last used (fire-and-forget; no need to block the request)
        await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
        return;
      }
    }
  }

  return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
}

export async function requireInstanceAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  // If requireAuth failed, userId is not set — stop here without sending again
  if (!request.userId) return;

  // A scoped API key never grants instance-admin access, even if its owner is one
  if (request.apiKeyScope && (request.apiKeyScope.projectId || request.apiKeyScope.role)) {
    return reply.status(403).send({ error: 'Forbidden', message: 'Scoped API keys cannot perform instance-admin actions' });
  }

  if (request.userRole !== 'instance_admin') {
    return reply.status(403).send({ error: 'Forbidden', message: 'Instance admin access required' });
  }
}

export async function requireProjectAccess(minRole: ProjectRole) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    await requireAuth(request, reply);
    // If requireAuth failed, userId is not set — stop here without sending again
    if (!request.userId) return;

    const projectId = (request.params as any).projectId;
    if (!projectId) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Project ID required' });
    }

    // Scoped API keys: if the key was issued for a specific project, it must
    // match the requested project, and its role caps what the user can do.
    if (request.apiKeyScope?.projectId) {
      if (request.apiKeyScope.projectId !== projectId) {
        return reply.status(403).send({ error: 'Forbidden', message: 'API key is scoped to a different project' });
      }
      const keyRole = request.apiKeyScope.role;
      if (!keyRole || ROLE_HIERARCHY[keyRole] < ROLE_HIERARCHY[minRole]) {
        return reply.status(403).send({ error: 'Forbidden', message: `API key role insufficient; requires ${minRole}` });
      }
      request.projectRole = keyRole;
      return;
    }

    // Unscoped session or unscoped API key — instance admins pass through
    if (request.userRole === 'instance_admin') {
      request.projectRole = 'project_admin';
      return;
    }

    const membership = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, request.userId),
      ),
    });

    if (!membership) {
      return reply.status(403).send({ error: 'Forbidden', message: 'No access to this project' });
    }

    if (ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[minRole]) {
      return reply.status(403).send({ error: 'Forbidden', message: `Requires ${minRole} access or higher` });
    }

    request.projectRole = membership.role;
  };
}
