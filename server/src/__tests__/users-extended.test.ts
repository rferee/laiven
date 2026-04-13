import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('@fastify/rate-limit', () => ({
  default: async () => {},
  __esModule: true,
}));

import {
  setupTestApp, teardownTestApp, inject, injectNoAuth, login,
  extractCookies, createUserAndLogin, addProjectMember,
  type TestContext,
} from './helpers.js';

let ctx: TestContext;
let app: FastifyInstance;
let adminCookies: string;
let projectId: string;

beforeAll(async () => {
  ctx = await setupTestApp();
  app = ctx.app;
  adminCookies = ctx.adminCookies;
  projectId = ctx.eldarianProjectId;
}, 60000);

afterAll(async () => {
  await teardownTestApp(ctx);
}, 30000);

describe('Users — creation validation', () => {
  it('returns 400 for empty email', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: '', displayName: 'No Email', password: 'password123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for empty displayName', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'usertest-2@test.local', displayName: '', password: 'password123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 for duplicate email', async () => {
    const email = 'usertest-3@test.local';
    // Create the user first
    const first = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/users',
      payload: { email, displayName: 'First User', password: 'password123!' },
    });
    expect(first.statusCode).toBe(200);

    // Try creating again with the same email
    const second = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/users',
      payload: { email, displayName: 'Duplicate User', password: 'password123!' },
    });
    expect(second.statusCode).toBe(409);
  });

  it('returns 400 for password shorter than 8 characters', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'usertest-4@test.local', displayName: 'Short PW', password: 'short' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Users — role management', () => {
  let userId: string;

  beforeAll(async () => {
    const { id } = await createUserAndLogin(app, adminCookies, {
      email: 'usertest-roles@test.local',
      displayName: 'Role Tester',
      password: 'password123!',
    });
    userId = id;
  });

  it('can update role from user to instance_admin', async () => {
    const res = await inject(app, adminCookies, {
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      payload: { role: 'instance_admin' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.role).toBe('instance_admin');
  });

  it('can update role from instance_admin back to user', async () => {
    const res = await inject(app, adminCookies, {
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      payload: { role: 'user' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.role).toBe('user');
  });
});

describe('Users — delete user with project membership', () => {
  it('soft-deletes user and they can no longer log in or appear in user list', async () => {
    const email = 'usertest-cleanup@test.local';
    // Create user
    const { id } = await createUserAndLogin(app, adminCookies, {
      email,
      displayName: 'Cleanup Test User',
      password: 'password123!',
    });

    // Add to project
    await addProjectMember(app, adminCookies, projectId, id, 'viewer');

    // Verify membership exists
    const membersBeforeRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/members`,
    });
    expect(membersBeforeRes.statusCode).toBe(200);
    const membersBefore = JSON.parse(membersBeforeRes.body);
    const foundBefore = membersBefore.items.find((m: any) => m.userId === id);
    expect(foundBefore).toBeDefined();

    // Delete the user
    const delRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
    });
    expect(delRes.statusCode).toBe(200);

    // Verify user no longer appears in the user list (soft-deleted)
    const usersRes = await inject(app, adminCookies, {
      method: 'GET',
      url: '/api/v1/users',
    });
    expect(usersRes.statusCode).toBe(200);
    const usersList = JSON.parse(usersRes.body);
    const foundUser = usersList.items.find((u: any) => u.id === id);
    expect(foundUser).toBeUndefined();

    // Verify user cannot log in
    const loginRes = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'password123!' },
    });
    expect(loginRes.statusCode).toBe(401);
  });
});

describe('Users — cannot delete yourself', () => {
  it('returns 400 when admin tries to delete themselves', async () => {
    // Get the admin user's ID
    const meRes = await inject(app, adminCookies, {
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(meRes.statusCode).toBe(200);
    const adminUserId = JSON.parse(meRes.body).id;

    const res = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/users/${adminUserId}`,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Users — non-admin access denied', () => {
  let regularCookies: string;
  let regularUserId: string;

  beforeAll(async () => {
    const result = await createUserAndLogin(app, adminCookies, {
      email: 'usertest-noadmin@test.local',
      displayName: 'Regular User',
      password: 'password123!',
    });
    regularCookies = result.cookies;
    regularUserId = result.id;
  });

  it('returns 403 for GET /users by non-admin', async () => {
    const res = await inject(app, regularCookies, {
      method: 'GET',
      url: '/api/v1/users',
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for POST /users by non-admin', async () => {
    const res = await inject(app, regularCookies, {
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        email: 'usertest-forbidden@test.local',
        displayName: 'Forbidden',
        password: 'password123!',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for PATCH /users/:id by non-admin', async () => {
    const res = await inject(app, regularCookies, {
      method: 'PATCH',
      url: `/api/v1/users/${regularUserId}`,
      payload: { displayName: 'Hacker' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 403 for DELETE /users/:id by non-admin', async () => {
    const res = await inject(app, regularCookies, {
      method: 'DELETE',
      url: `/api/v1/users/${regularUserId}`,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Users — cursor and search', () => {
  beforeAll(async () => {
    for (let i = 0; i < 3; i++) {
      await inject(app, adminCookies, {
        method: 'POST',
        url: '/api/v1/users',
        payload: {
          email: `usersearch-${i}@test.local`,
          displayName: `Searchable User ${i}`,
          password: 'password123!',
        },
      });
    }
  });

  it('filters by search (case-insensitive match on displayName)', async () => {
    const res = await inject(app, adminCookies, {
      method: 'GET',
      url: '/api/v1/users?search=searchable',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    expect(body.items.every((u: any) => /searchable/i.test(u.displayName))).toBe(true);
  });

  it('filters by search (match on email prefix)', async () => {
    const res = await inject(app, adminCookies, {
      method: 'GET',
      url: '/api/v1/users?search=usersearch-1',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items.length).toBe(1);
    expect(body.items[0].email).toBe('usersearch-1@test.local');
  });

  it('cursor pagination returns distinct pages', async () => {
    const firstRes = await inject(app, adminCookies, {
      method: 'GET',
      url: '/api/v1/users?limit=2',
    });
    expect(firstRes.statusCode).toBe(200);
    const firstBody = JSON.parse(firstRes.body);
    expect(firstBody.items.length).toBe(2);
    expect(firstBody.nextCursor).toBeTruthy();

    const secondRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/users?limit=2&cursor=${firstBody.nextCursor}`,
    });
    expect(secondRes.statusCode).toBe(200);
    const secondBody = JSON.parse(secondRes.body);
    const firstIds = firstBody.items.map((u: any) => u.id);
    const secondIds = secondBody.items.map((u: any) => u.id);
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
  });
});
