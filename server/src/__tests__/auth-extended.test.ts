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

describe('Auth — login failures', () => {
  it('returns 401 for wrong password', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@laiven.local', password: 'wrongpassword123' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for non-existent email', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@laiven.local', password: 'admin123!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for empty email', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: '', password: 'admin123!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for empty password', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@laiven.local', password: '' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for SQL-injection-style email (no crash)', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: "' OR 1=1 --", password: 'admin123!' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for SQL-injection-style password (no crash)', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@laiven.local', password: "' OR 1=1 --" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth — login with soft-deleted user', () => {
  let deletedUserEmail: string;

  beforeAll(async () => {
    deletedUserEmail = 'authtest-7@test.local';
    const { id } = await createUserAndLogin(app, adminCookies, {
      email: deletedUserEmail,
      displayName: 'Deleted Auth User',
      password: 'password123!',
    });
    // Soft-delete the user
    const delRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
    });
    expect(delRes.statusCode).toBe(200);
  });

  it('returns 401 when logging in as a soft-deleted user', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: deletedUserEmail, password: 'password123!' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth — session checks', () => {
  it('returns 401 for GET /auth/me with no session', async () => {
    const res = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('logout twice — second call still succeeds', async () => {
    const { cookies } = await createUserAndLogin(app, adminCookies, {
      email: 'authtest-9@test.local',
      displayName: 'Logout Tester',
      password: 'password123!',
    });

    const first = await inject(app, cookies, {
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    expect(first.statusCode).toBe(200);

    const second = await inject(app, cookies, {
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    expect(second.statusCode).toBe(200);
  });
});

describe('Auth — setup endpoint when already set up', () => {
  it('returns 400 when setup is already complete', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: {
        email: 'newadmin@test.local',
        displayName: 'New Admin',
        password: 'password123!',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when email field is missing', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: {
        displayName: 'No Email',
        password: 'password123!',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when password is too weak (< 8 chars)', async () => {
    const res = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/setup',
      payload: {
        email: 'weakpw@test.local',
        displayName: 'Weak PW',
        password: 'short',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Auth — API key authentication', () => {
  let apiKey: string;
  let apiKeyId: string;

  beforeAll(async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'test-key-auth' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    apiKey = body.key;
    apiKeyId = body.id;
  });

  it('can authenticate with a valid API key via x-api-key header', async () => {
    const res = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-api-key': apiKey },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('admin@laiven.local');
  });

  it('returns 401 after revoking the key', async () => {
    // Create a separate key to revoke
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'test-key-revoke' },
    });
    const { key, id } = JSON.parse(createRes.body);

    // Revoke
    const revokeRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/auth/api-keys/${id}`,
    });
    expect(revokeRes.statusCode).toBe(200);

    // Try using the revoked key
    const res = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-api-key': key },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for a random/wrong key', async () => {
    const res = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-api-key': 'lv_totally_fake_key_1234567890' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for malformed header (garbage)', async () => {
    const res = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-api-key': '!!!garbage!!!' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth — API key for soft-deleted user', () => {
  it('returns 401 when using key belonging to a soft-deleted user', async () => {
    // Create user and login
    const { id, cookies } = await createUserAndLogin(app, adminCookies, {
      email: 'authtest-17@test.local',
      displayName: 'API Key Deleted User',
      password: 'password123!',
    });

    // Create API key under that user's session
    const keyRes = await inject(app, cookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'doomed-key' },
    });
    expect(keyRes.statusCode).toBe(200);
    const { key } = JSON.parse(keyRes.body);

    // Soft-delete the user
    const delRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
    });
    expect(delRes.statusCode).toBe(200);

    // Try using the key
    const res = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-api-key': key },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Auth — API key scoping (projectId + role)', () => {
  let secondProjectId: string;
  let memberCookies: string;
  let memberUserId: string;

  beforeAll(async () => {
    // Create a second project (as admin)
    const projRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'ScopeTestProject', description: 'scope test' },
    });
    expect(projRes.statusCode).toBe(200);
    secondProjectId = JSON.parse(projRes.body).id;

    // Create a non-admin user and make them an editor on the primary project
    const result = await createUserAndLogin(app, adminCookies, {
      email: 'authtest-scope@test.local',
      displayName: 'Scope Tester',
      password: 'password123!',
    });
    memberCookies = result.cookies;
    memberUserId = result.id;
    await addProjectMember(app, adminCookies, projectId, memberUserId, 'editor');
  });

  it('rejects create with projectId but no role', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'scope-bad-1', projectId },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects create with role but no projectId', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'scope-bad-2', role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects create with invalid role', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'scope-bad-3', projectId, role: 'owner' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects create when user is not a project member', async () => {
    // memberCookies user has no access to secondProjectId
    const res = await inject(app, memberCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'scope-bad-4', projectId: secondProjectId, role: 'viewer' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('scoped viewer key allows GET on the scoped project but 403s writes', async () => {
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'scope-viewer', projectId, role: 'viewer' },
    });
    expect(createRes.statusCode).toBe(200);
    const { key } = JSON.parse(createRes.body);

    const readRes = await injectNoAuth(app, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/attributes`,
      headers: { 'x-api-key': key },
    });
    expect(readRes.statusCode).toBe(200);

    const writeRes = await injectNoAuth(app, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/attributes`,
      headers: { 'x-api-key': key },
      payload: { name: 'test', identifier: 'test', type: 'string' },
    });
    expect(writeRes.statusCode).toBe(403);
  });

  it('scoped key rejected on a different project', async () => {
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'scope-other', projectId, role: 'editor' },
    });
    const { key } = JSON.parse(createRes.body);

    const res = await injectNoAuth(app, {
      method: 'GET',
      url: `/api/v1/projects/${secondProjectId}/attributes`,
      headers: { 'x-api-key': key },
    });
    expect(res.statusCode).toBe(403);
  });

  it('unscoped key still authenticates as user with full permissions', async () => {
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'unscoped' },
    });
    const { key } = JSON.parse(createRes.body);

    const res = await injectNoAuth(app, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/attributes`,
      headers: { 'x-api-key': key },
    });
    expect(res.statusCode).toBe(200);
  });

  it('scoped API key cannot perform instance-admin actions', async () => {
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'scope-admin-block', projectId, role: 'project_admin' },
    });
    const { key } = JSON.parse(createRes.body);

    const res = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/users',
      headers: { 'x-api-key': key },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Auth — API key lastUsedAt tracking', () => {
  it('updates lastUsedAt after using the key', async () => {
    // Create a fresh key
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'test-key-lastused' },
    });
    expect(createRes.statusCode).toBe(200);
    const { key, id: keyId } = JSON.parse(createRes.body);

    // Use the key
    const useRes = await injectNoAuth(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { 'x-api-key': key },
    });
    expect(useRes.statusCode).toBe(200);

    // Check lastUsedAt is set
    const listRes = await inject(app, adminCookies, {
      method: 'GET',
      url: '/api/v1/auth/api-keys',
    });
    expect(listRes.statusCode).toBe(200);
    const keys = JSON.parse(listRes.body);
    const found = keys.find((k: any) => k.id === keyId);
    expect(found).toBeDefined();
    expect(found.lastUsedAt).not.toBeNull();
  });
});

describe('Auth — profile updates', () => {
  let userCookies: string;

  beforeAll(async () => {
    const result = await createUserAndLogin(app, adminCookies, {
      email: 'authtest-profile@test.local',
      displayName: 'Profile Tester',
      password: 'password123!',
    });
    userCookies = result.cookies;
  });

  it('returns 400 when changing password with wrong currentPassword', async () => {
    const res = await inject(app, userCookies, {
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      payload: {
        currentPassword: 'definitelywrong!',
        newPassword: 'newpassword123!',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when new password is too short (< 8 chars)', async () => {
    const res = await inject(app, userCookies, {
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      payload: {
        currentPassword: 'password123!',
        newPassword: 'short',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when displayName is empty', async () => {
    const res = await inject(app, userCookies, {
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      payload: {
        displayName: '',
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Auth — API key after user removed from project', () => {
  it('documents behavior when API key user loses project access', async () => {
    // Create a user and add to project as editor
    const { id: userId, cookies: userCookies } = await createUserAndLogin(app, adminCookies, {
      email: 'authtest-projkey@test.local',
      displayName: 'Project Key User',
      password: 'password123!',
    });

    await addProjectMember(app, adminCookies, projectId, userId, 'editor');

    // Create an API key for that user
    const keyRes = await inject(app, userCookies, {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'project-scoped-key' },
    });
    expect(keyRes.statusCode).toBe(200);
    const { key } = JSON.parse(keyRes.body);

    // Verify the key works for project access
    const beforeRes = await injectNoAuth(app, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/attributes`,
      headers: { 'x-api-key': key },
    });
    expect(beforeRes.statusCode).toBe(200);

    // Remove user from project (endpoint uses userId, not membership id)
    const removeRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/members/${userId}`,
    });
    expect(removeRes.statusCode).toBe(200);

    // Try to use the API key to access the project after removal
    const afterRes = await injectNoAuth(app, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/attributes`,
      headers: { 'x-api-key': key },
    });
    // The user lost project access, so should get 403
    expect(afterRes.statusCode).toBe(403);
  });
});

describe('Auth — session persistence after password change', () => {
  it('session survives password change (session not invalidated)', async () => {
    const { cookies: sessionCookies } = await createUserAndLogin(app, adminCookies, {
      email: 'authtest-pwchange@test.local',
      displayName: 'Password Changer',
      password: 'password123!',
    });

    // Verify session works before password change
    const beforeRes = await inject(app, sessionCookies, {
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(beforeRes.statusCode).toBe(200);

    // Change password
    const changeRes = await inject(app, sessionCookies, {
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      payload: {
        currentPassword: 'password123!',
        newPassword: 'newpassword456!',
      },
    });
    expect(changeRes.statusCode).toBe(200);

    // Test whether the same session still works
    const afterRes = await inject(app, sessionCookies, {
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(afterRes.statusCode).toBe(200);

    // The new password should work for login regardless
    const loginRes = await injectNoAuth(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'authtest-pwchange@test.local', password: 'newpassword456!' },
    });
    expect(loginRes.statusCode).toBe(200);
  });
});
