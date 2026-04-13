import type { FastifyInstance } from 'fastify';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { projects, projectMembers, users } from '../../db/schema/index.js';
import { requireAuth, requireInstanceAdmin, requireProjectAccess } from '../../middleware/auth.js';

const validProjectRoles = ['project_admin', 'editor', 'viewer'] as const;
type ProjectRole = typeof validProjectRoles[number];

export async function projectRoutes(app: FastifyInstance) {
  // List projects accessible to current user
  app.get('/api/v1/projects', {
    schema: { tags: ['Projects'] },
    preHandler: [requireAuth],
  }, async (request) => {
    if (request.userRole === 'instance_admin') {
      // Instance admins see all projects
      const allProjects = await db.select()
        .from(projects)
        .where(isNull(projects.deletedAt));

      return { items: allProjects };
    }

    // Regular users see only their projects
    const memberships = await db.select({ projectId: projectMembers.projectId, role: projectMembers.role })
      .from(projectMembers)
      .where(eq(projectMembers.userId, request.userId!));

    if (memberships.length === 0) return { items: [] };

    const projectIds = memberships.map(m => m.projectId);
    const userProjects = await db.select()
      .from(projects)
      .where(and(
        inArray(projects.id, projectIds),
        isNull(projects.deletedAt),
      ));

    return {
      items: userProjects.map(p => ({
        ...p,
        role: memberships.find(m => m.projectId === p.id)?.role,
      })),
    };
  });

  // Create project (Instance Admin only)
  app.post('/api/v1/projects', {
    schema: { tags: ['Projects'] },
    preHandler: [requireInstanceAdmin],
  }, async (request, reply) => {
    const { name, description } = request.body as { name: string; description?: string };

    if (!name) {
      return reply.status(400).send({ error: 'Project name is required' });
    }

    const [project] = await db.insert(projects).values({
      name,
      description: description || null,
      createdBy: request.userId!,
    }).returning();

    // Auto-add creator as project admin
    await db.insert(projectMembers).values({
      projectId: project.id,
      userId: request.userId!,
      role: 'project_admin',
    });

    return project;
  });

  // Get project
  app.get('/api/v1/projects/:projectId', {
    schema: { tags: ['Projects'] },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Check access
    if (request.userRole !== 'instance_admin') {
      const membership = await db.query.projectMembers.findFirst({
        where: and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, request.userId!),
        ),
      });
      if (!membership) {
        return reply.status(403).send({ error: 'No access to this project' });
      }
    }

    return project;
  });

  // Update project
  app.patch('/api/v1/projects/:projectId', {
    schema: { tags: ['Projects'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const updates = request.body as { name?: string; description?: string };
    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name) setValues.name = updates.name;
    if (updates.description !== undefined) setValues.description = updates.description;

    const [updated] = await db.update(projects)
      .set(setValues)
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return updated;
  });

  // Soft delete project
  app.delete('/api/v1/projects/:projectId', {
    schema: { tags: ['Projects'] },
    preHandler: [requireInstanceAdmin],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const [project] = await db.update(projects)
      .set({ deletedAt: new Date() })
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .returning();

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return { success: true };
  });

  // List project members
  app.get('/api/v1/projects/:projectId/members', {
    schema: { tags: ['Projects'] },
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    const members = await db.select({
      userId: projectMembers.userId,
      role: projectMembers.role,
      email: users.email,
      displayName: users.displayName,
      joinedAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));

    return { items: members };
  });

  // Add member
  app.post('/api/v1/projects/:projectId/members', {
    schema: { tags: ['Projects'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { userId, role } = request.body as { userId: string; role: string };

    if (!validProjectRoles.includes(role as ProjectRole)) {
      return reply.status(400).send({ error: 'Invalid role. Must be: project_admin, editor, or viewer' });
    }

    // Check if already a member
    const existing = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    });

    if (existing) {
      return reply.status(409).send({ error: 'User is already a member of this project' });
    }

    const [member] = await db.insert(projectMembers).values({
      projectId,
      userId,
      role: role as ProjectRole,
    }).returning();

    return member;
  });

  // Change member role
  app.patch('/api/v1/projects/:projectId/members/:userId', {
    schema: { tags: ['Projects'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, userId } = request.params as { projectId: string; userId: string };
    const { role } = request.body as { role: string };

    if (!validProjectRoles.includes(role as ProjectRole)) {
      return reply.status(400).send({ error: 'Invalid role. Must be: project_admin, editor, or viewer' });
    }

    const [updated] = await db.update(projectMembers)
      .set({ role: role as ProjectRole })
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ))
      .returning();

    if (!updated) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    return updated;
  });

  // Remove member
  app.delete('/api/v1/projects/:projectId/members/:userId', {
    schema: { tags: ['Projects'] },
    preHandler: [await requireProjectAccess('project_admin')],
  }, async (request, reply) => {
    const { projectId, userId } = request.params as { projectId: string; userId: string };

    const [deleted] = await db.delete(projectMembers)
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ))
      .returning();

    if (!deleted) {
      return reply.status(404).send({ error: 'Member not found' });
    }

    return { success: true };
  });
}
