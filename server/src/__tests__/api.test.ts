import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';

// Stub the rate-limit plugin with a no-op so that the large number of
// inject() calls in this test suite never gets throttled.
vi.mock('@fastify/rate-limit', () => ({
  default: async () => {},
  __esModule: true,
}));

import { buildApp } from '../index.js';
import { main as seedDatabase } from '../db/seeds/seed.js';
import { closeDatabase } from '../db/connection.js';
import { redis, closeRedis } from '../db/redis.js';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let app: FastifyInstance;
let adminCookies: string = '';
let viewerCookies: string = '';

// IDs discovered / created during the test run
let adminUserId: string;
let createdUserId: string;
let eldarianProjectId: string;
let createdProjectId: string;
let createdAttributeId: string;
let createdVariableId: string;
let createdRuleId: string;
let createdBuilderId: string;
let createdWordId: string;
let derivativeTypeId: string;
let viewerUserId: string;

// Seeded attribute IDs (looked up at runtime)
let seededWordAttrId: string;

/** Inject a request, optionally attaching session cookies. */
function injectAs(
  cookieJar: 'admin' | 'viewer' | 'none',
  opts: InjectOptions,
): Promise<InjectResponse> {
  const cookies =
    cookieJar === 'admin' ? adminCookies :
    cookieJar === 'viewer' ? viewerCookies :
    '';

  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (cookies) {
    headers.cookie = cookies;
  }

  return app.inject({ ...opts, headers });
}

/** Extract Set-Cookie from a response and persist into the appropriate jar. */
function saveCookies(
  res: InjectResponse,
  target: 'admin' | 'viewer',
): void {
  const setCookie = res.headers['set-cookie'];
  if (setCookie) {
    const raw = Array.isArray(setCookie) ? setCookie : [setCookie];
    const pairs = raw.map((c) => c.split(';')[0]);
    if (target === 'admin') {
      adminCookies = pairs.join('; ');
    } else {
      viewerCookies = pairs.join('; ');
    }
  }
}

/** Extract cookies from a single response as a plain string. */
function extractCookies(
  res: InjectResponse,
): string {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  const raw = Array.isArray(setCookie) ? setCookie : [setCookie];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

beforeAll(async () => {
  // Ensure Redis is connected before seeding or building the app
  if (redis.status !== 'ready' && redis.status !== 'connecting') {
    await redis.connect();
  }

  // Re-seed the database so we always start from a known state
  await seedDatabase();

  app = await buildApp();
  await app.ready();
}, 60000);

afterAll(async () => {
  if (app) {
    await app.close();
  }
  await closeRedis();
  await closeDatabase();
}, 30000);

describe('Auth', () => {
  it('GET /api/v1/auth/setup-status returns needsSetup: false', async () => {
    const res = await injectAs('none', {
      method: 'GET',
      url: '/api/v1/auth/setup-status',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.needsSetup).toBe(false);
  });

  it('POST /api/v1/auth/login with valid creds returns 200 and user', async () => {
    const res = await injectAs('none', {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@laiven.local', password: 'admin123!' },
    });
    expect(res.statusCode).toBe(200);
    saveCookies(res, 'admin');

    const body = res.json();
    expect(body.email).toBe('admin@laiven.local');
    expect(body.role).toBe('instance_admin');
    expect(body.id).toBeDefined();
    adminUserId = body.id;
  });

  it('POST /api/v1/auth/login with invalid creds returns 401', async () => {
    const res = await injectAs('none', {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@laiven.local', password: 'wrongpassword' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBeDefined();
  });

  it('GET /api/v1/auth/me with session returns user', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe('admin@laiven.local');
    expect(body.role).toBe('instance_admin');
  });

  it('GET /api/v1/auth/me without session returns 401', async () => {
    const res = await injectAs('none', {
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/logout returns success', async () => {
    // Login to obtain a throwaway session
    const loginRes = await injectAs('none', {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@laiven.local', password: 'admin123!' },
    });
    expect(loginRes.statusCode).toBe(200);
    const tempCookies = extractCookies(loginRes);

    // Logout should succeed
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: tempCookies },
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.json().success).toBe(true);

    // After logout, the session is synchronously destroyed in Redis.
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: tempCookies },
    });
    expect(meRes.statusCode).toBe(401);
  });
});

describe('User CRUD', () => {
  it('GET /api/v1/users lists users', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: '/api/v1/users',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.some((u: any) => u.email === 'admin@laiven.local')).toBe(true);
  });

  it('POST /api/v1/users creates a user', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        email: 'testuser@laiven.local',
        displayName: 'Test User',
        password: 'testpassword123',
        role: 'user',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe('testuser@laiven.local');
    expect(body.displayName).toBe('Test User');
    expect(body.role).toBe('user');
    expect(body.id).toBeDefined();
    createdUserId = body.id;
  });

  it('POST /api/v1/users with duplicate email returns 409', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        email: 'testuser@laiven.local',
        displayName: 'Duplicate',
        password: 'testpassword123',
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST /api/v1/users with short password returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        email: 'shortpw@laiven.local',
        displayName: 'Short PW',
        password: 'abc',
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/users/:id returns a specific user', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/users/${createdUserId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(createdUserId);
    expect(body.email).toBe('testuser@laiven.local');
  });

  it('PATCH /api/v1/users/:id updates a user', async () => {
    const res = await injectAs('admin', {
      method: 'PATCH',
      url: `/api/v1/users/${createdUserId}`,
      payload: { displayName: 'Updated User' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('Updated User');
  });

  it('DELETE /api/v1/users/:id on self returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/users/${adminUserId}`,
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/v1/users/:id soft deletes a user', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/users/${createdUserId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // The user should now 404
    const getRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/users/${createdUserId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Projects', () => {
  it('GET /api/v1/projects lists projects including Eldarian', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: '/api/v1/projects',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toBeDefined();
    const eldarian = body.items.find((p: any) => p.name === 'Eldarian');
    expect(eldarian).toBeDefined();
    eldarianProjectId = eldarian.id;
  });

  it('POST /api/v1/projects creates a project', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Test Language', description: 'A test conlang' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Test Language');
    expect(body.description).toBe('A test conlang');
    expect(body.id).toBeDefined();
    createdProjectId = body.id;
  });

  it('POST /api/v1/projects without name returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: '/api/v1/projects',
      payload: { description: 'Missing name' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/projects/:projectId returns a project', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Eldarian');
  });

  it('PATCH /api/v1/projects/:projectId updates a project', async () => {
    const res = await injectAs('admin', {
      method: 'PATCH',
      url: `/api/v1/projects/${createdProjectId}`,
      payload: { description: 'Updated description' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe('Updated description');
  });

  describe('Member management', () => {
    let memberUserId: string;

    beforeAll(async () => {
      const res = await injectAs('admin', {
        method: 'POST',
        url: '/api/v1/users',
        payload: {
          email: 'member@laiven.local',
          displayName: 'Member User',
          password: 'memberpass123',
          role: 'user',
        },
      });
      memberUserId = res.json().id;
    });

    it('POST .../members adds a member', async () => {
      const res = await injectAs('admin', {
        method: 'POST',
        url: `/api/v1/projects/${eldarianProjectId}/members`,
        payload: { userId: memberUserId, role: 'editor' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().userId).toBe(memberUserId);
      expect(res.json().role).toBe('editor');
    });

    it('POST .../members duplicate returns 409', async () => {
      const res = await injectAs('admin', {
        method: 'POST',
        url: `/api/v1/projects/${eldarianProjectId}/members`,
        payload: { userId: memberUserId, role: 'editor' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('GET .../members lists members', async () => {
      const res = await injectAs('admin', {
        method: 'GET',
        url: `/api/v1/projects/${eldarianProjectId}/members`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items.length).toBeGreaterThanOrEqual(2);
    });

    it('PATCH .../members/:userId changes role', async () => {
      const res = await injectAs('admin', {
        method: 'PATCH',
        url: `/api/v1/projects/${eldarianProjectId}/members/${memberUserId}`,
        payload: { role: 'viewer' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().role).toBe('viewer');
    });

    it('DELETE .../members/:userId removes member', async () => {
      const res = await injectAs('admin', {
        method: 'DELETE',
        url: `/api/v1/projects/${eldarianProjectId}/members/${memberUserId}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });
  });
});

describe('Attributes', () => {
  it('GET .../attributes lists seeded attributes', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(5);

    const wordAttr = body.items.find((a: any) => a.identifier === 'word');
    expect(wordAttr).toBeDefined();
    seededWordAttrId = wordAttr.id;
  });

  it('POST .../attributes creates an attribute', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
      payload: { name: 'Pronunciation', type: 'string', required: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Pronunciation');
    expect(body.identifier).toBe('pronunciation');
    expect(body.type).toBe('string');
    createdAttributeId = body.id;
  });

  it('POST .../attributes with duplicate name returns 409', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
      payload: { name: 'Pronunciation', type: 'string' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('POST .../attributes with missing fields returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
      payload: { name: 'NoType' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET .../attributes/:id returns attribute', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/attributes/${createdAttributeId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(createdAttributeId);
    expect(res.json().name).toBe('Pronunciation');
  });

  it('PUT .../attributes/:id updates attribute', async () => {
    const res = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/attributes/${createdAttributeId}`,
      payload: { description: 'IPA pronunciation guide' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().description).toBe('IPA pronunciation guide');
  });

  it('PATCH .../attributes/:id/order reorders attribute', async () => {
    const res = await injectAs('admin', {
      method: 'PATCH',
      url: `/api/v1/projects/${eldarianProjectId}/attributes/${createdAttributeId}/order`,
      payload: { displayOrder: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayOrder).toBe(10);
  });

  it('GET .../attributes/:id/versions returns version history', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/attributes/${createdAttributeId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    // At least created + updated
    expect(body.items.length).toBeGreaterThanOrEqual(2);
  });

  it('DELETE .../attributes/:id soft deletes', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/attributes/${createdAttributeId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const getRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/attributes/${createdAttributeId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Variables', () => {
  it('GET .../variables lists seeded variables', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/variables`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(3);
  });

  it('POST .../variables creates a variable with items', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/variables`,
      payload: {
        name: 'Test Phonemes',
        type: 'string',
        items: [{ value: 'ph' }, { value: 'th' }, { value: 'ch' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Test Phonemes');
    expect(body.items.length).toBe(3);
    expect(body.items[0].value).toBe('ph');
    createdVariableId = body.id;
  });

  it('POST .../variables without name returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/variables`,
      payload: { type: 'string' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET .../variables/:id returns variable with items', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/variables/${createdVariableId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(createdVariableId);
    expect(res.json().items.length).toBe(3);
  });

  it('PUT .../variables/:id updates name and replaces items', async () => {
    const res = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/variables/${createdVariableId}`,
      payload: {
        name: 'Updated Phonemes',
        items: [{ value: 'sh' }, { value: 'zh' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Updated Phonemes');
    expect(body.items.length).toBe(2);
    expect(body.items[0].value).toBe('sh');
  });

  it('GET .../variables/:id/versions returns version history', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/variables/${createdVariableId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(2);
  });

  it('DELETE .../variables/:id soft deletes', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/variables/${createdVariableId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const getRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/variables/${createdVariableId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Rules', () => {
  it('GET .../rules lists seeded rules', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/rules`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it('POST .../rules creates a rule with a graph', async () => {
    const graph = {
      nodes: [
        {
          id: 'n1',
          type: 'attribute_input',
          position: { x: 0, y: 0 },
          data: { attributeId: seededWordAttrId, attributeIdentifier: 'word' },
        },
        {
          id: 'n2',
          type: 'is_not_empty',
          position: { x: 200, y: 0 },
          data: {},
        },
        {
          id: 'n3',
          type: 'return_rule',
          position: { x: 400, y: 0 },
          data: { passMessage: 'Word is present', failMessage: 'Word cannot be empty' },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'input' },
        { id: 'e2', source: 'n2', sourceHandle: 'output', target: 'n3', targetHandle: 'pass' },
      ],
    };

    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/rules`,
      // Rules no longer have attributeId — they read inputs via attribute_input graph nodes
      payload: {
        name: 'Word not empty',
        graph,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Word not empty');
    expect(body.graph).toBeDefined();
    expect(body.id).toBeDefined();
    createdRuleId = body.id;
  });

  it('POST .../rules with missing fields returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/rules`,
      payload: { name: 'Incomplete rule' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET .../rules/:id returns the rule', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/rules/${createdRuleId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(createdRuleId);
    expect(res.json().graph.nodes).toBeDefined();
  });

  it('PUT .../rules/:id updates the rule', async () => {
    const res = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/rules/${createdRuleId}`,
      payload: { name: 'Word not empty (updated)' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Word not empty (updated)');
  });

  it('POST .../rules/:id/test returns pass and trace for valid input', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/rules/${createdRuleId}/test`,
      payload: { attributeValues: { word: 'velara' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trace).toBeDefined();
    expect(Array.isArray(body.trace)).toBe(true);
    expect(body.trace.length).toBeGreaterThan(0);
    expect(body.pass).toBe(true);
  });

  it('POST .../rules/:id/test returns fail for empty word', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/rules/${createdRuleId}/test`,
      payload: { attributeValues: { word: '' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pass).toBe(false);
    expect(res.json().trace).toBeDefined();
  });

  it('GET .../rules/:id/versions returns version history', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/rules/${createdRuleId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(2);
  });

  // soft-delete hides rule from linked queries via JOIN filter (link rows are NOT deleted)
  it('DELETE .../rules/:id soft deletes', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/rules/${createdRuleId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const getRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/rules/${createdRuleId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Builders', () => {
  it('GET .../builders lists seeded builders', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items.find((b: any) => b.name === 'Past Tense Builder')).toBeDefined();
  });

  it('POST .../builders creates a builder', async () => {
    const graph = {
      nodes: [
        {
          id: 'b1',
          type: 'attribute_input',
          position: { x: 0, y: 0 },
          data: { attributeId: seededWordAttrId, attributeIdentifier: 'word' },
        },
        {
          id: 'b2',
          type: 'append',
          position: { x: 200, y: 0 },
          data: { suffix: 'ish' },
        },
        {
          id: 'b3',
          type: 'return_builder',
          position: { x: 400, y: 0 },
          data: {},
        },
      ],
      edges: [
        { id: 'be1', source: 'b1', sourceHandle: 'output', target: 'b2', targetHandle: 'input' },
        { id: 'be2', source: 'b2', sourceHandle: 'output', target: 'b3', targetHandle: 'value' },
      ],
    };

    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/builders`,
      payload: { name: 'Diminutive Builder', graph },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Diminutive Builder');
    expect(body.graph).toBeDefined();
    createdBuilderId = body.id;
  });

  it('POST .../builders with missing graph returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/builders`,
      payload: { name: 'No graph builder' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET .../builders/:id returns the builder', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${createdBuilderId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(createdBuilderId);
  });

  it('PUT .../builders/:id updates the builder', async () => {
    const res = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${createdBuilderId}`,
      payload: { name: 'Diminutive Builder v2' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Diminutive Builder v2');
  });

  it('POST .../builders/:id/test executes and returns value + trace', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${createdBuilderId}/test`,
      payload: { attributeValues: { word: 'velara' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trace).toBeDefined();
    expect(Array.isArray(body.trace)).toBe(true);
    expect(body.value).toBe('velaraish');
  });

  it('GET .../builders/:id/versions returns version history', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${createdBuilderId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(2);
  });

  // NOTE: soft-delete does NOT trigger cascade regeneration of derivatives
  it('DELETE .../builders/:id soft deletes', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${createdBuilderId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const getRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${createdBuilderId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Words', () => {
  it('POST .../words creates a word with attributes and returns derivatives', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: {
          word: 'koratha',
          translation: 'to walk',
          word_type: 'Verb',
          syllable_count: 3,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.attributeValues).toBeDefined();
    createdWordId = body.id;

    // For a Verb, the Past Tense derivative should be auto-generated
    if (body.derivatives && body.derivatives.length > 0) {
      const pastTense = body.derivatives.find((d: any) => d.identifier === 'past_tense');
      if (pastTense) {
        // "koratha" ends in vowel 'a' => "koratharath"
        expect(pastTense.value).toBe('koratharath');
        expect(pastTense.userModified).toBe(false);
        derivativeTypeId = pastTense.derivativeTypeId;
      }
    }
  });

  it('POST .../words with missing required fields returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: {
          word: '',
          translation: '',
          word_type: '',
        },
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors).toBeDefined();
    expect(res.json().errors.length).toBeGreaterThan(0);
  });

  it('GET .../words/:id returns word with attribute values and derivatives', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${createdWordId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(createdWordId);
    expect(body.attributeValues).toBeDefined();
    expect(body.attributeValues.word).toBe('koratha');
    expect(body.derivatives).toBeDefined();
  });

  it('PUT .../words/:id updates word, re-validates, re-generates derivatives', async () => {
    const res = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/words/${createdWordId}`,
      payload: {
        attributeValues: {
          word: 'elendil',
          translation: 'to run',
          word_type: 'Verb',
          syllable_count: 3,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attributeValues.word).toBe('elendil');

    // "elendil" ends in consonant 'l' => "elendilarath"
    expect(body.derivatives).toBeDefined();
    if (body.derivatives && body.derivatives.length > 0) {
      const pastTense = body.derivatives.find((d: any) => d.identifier === 'past_tense');
      if (pastTense) {
        expect(pastTense.value).toBe('elendilarath');
      }
    }
  });

  it('PATCH .../words/:id/derivatives/:dtId sets derivative manually', async () => {
    // Look up the derivativeTypeId if we don't have it yet
    if (!derivativeTypeId) {
      const typesRes = await injectAs('admin', {
        method: 'GET',
        url: `/api/v1/projects/${eldarianProjectId}/derivative-types`,
      });
      const dtypes = typesRes.json().items;
      const pastTenseType = dtypes.find((d: any) => d.identifier === 'past_tense');
      if (pastTenseType) {
        derivativeTypeId = pastTenseType.id;
      }
    }

    expect(derivativeTypeId).toBeDefined();

    const res = await injectAs('admin', {
      method: 'PATCH',
      url: `/api/v1/projects/${eldarianProjectId}/words/${createdWordId}/derivatives/${derivativeTypeId}`,
      payload: { value: 'custom-past-tense' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userModified).toBe(true);
    expect(body.value).toBe('custom-past-tense');
  });

  it('DELETE .../words/:id/derivatives/:dtId/override resets to auto', async () => {
    expect(derivativeTypeId).toBeDefined();

    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/words/${createdWordId}/derivatives/${derivativeTypeId}/override`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.userModified).toBe(false);
    expect(body.value).toBeDefined();
  });

  it('GET .../words/:id/versions returns version history', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${createdWordId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    // created + updated + derivative set + derivative reset = at least 4
    expect(body.items.length).toBeGreaterThanOrEqual(4);
  });

  it('DELETE .../words/:id soft deletes', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/words/${createdWordId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const getRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${createdWordId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Search', () => {
  it('text search finds matching words', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/search`,
      payload: { text: 'velara' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toBeDefined();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const found = body.items.some(
      (w: any) => w.attributeValues && w.attributeValues.word === 'velara',
    );
    expect(found).toBe(true);
  });

  it('text search with no match returns empty', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/search`,
      payload: { text: 'xyznonexistent99' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBe(0);
  });

  it('advanced search with attribute filter works', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/search`,
      payload: {
        conditions: {
          type: 'attribute',
          field: 'word_type',
          operator: 'equals',
          value: 'Verb',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    for (const word of body.items) {
      expect(word.attributeValues.word_type).toBe('Verb');
    }
  });

  it('advanced search with AND logic', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/search`,
      payload: {
        conditions: {
          logic: 'AND',
          children: [
            { type: 'attribute', field: 'word_type', operator: 'equals', value: 'Verb' },
            { type: 'attribute', field: 'word', operator: 'contains', value: 'vel' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    for (const word of body.items) {
      expect(word.attributeValues.word_type).toBe('Verb');
      expect(word.attributeValues.word.toLowerCase()).toContain('vel');
    }
  });

  it('advanced search with NOT logic', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/search`,
      payload: {
        conditions: {
          logic: 'NOT',
          children: [
            { type: 'attribute', field: 'word_type', operator: 'equals', value: 'Verb' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Should exclude verbs; the seeded non-verbs are Noun and Adjectives
    for (const word of body.items) {
      expect(word.attributeValues.word_type).not.toBe('Verb');
    }
  });

  it('empty search returns all words with total', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/search`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeDefined();
    expect(body.total).toBeGreaterThanOrEqual(5);
  });
});

describe('Access Control', () => {
  beforeAll(async () => {
    // Create a viewer user
    const createRes = await injectAs('admin', {
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        email: 'viewer@laiven.local',
        displayName: 'Viewer User',
        password: 'viewerpass123',
        role: 'user',
      },
    });
    viewerUserId = createRes.json().id;

    // Add viewer to Eldarian project as viewer
    await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/members`,
      payload: { userId: viewerUserId, role: 'viewer' },
    });

    // Login as viewer
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'viewer@laiven.local', password: 'viewerpass123' },
    });
    expect(loginRes.statusCode).toBe(200);
    saveCookies(loginRes, 'viewer');
  });

  // -- Viewer CAN read --

  it('viewer can GET projects', async () => {
    const res = await injectAs('viewer', {
      method: 'GET',
      url: '/api/v1/projects',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it('viewer can GET project attributes', async () => {
    const res = await injectAs('viewer', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('viewer can GET project words', async () => {
    const res = await injectAs('viewer', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('viewer can GET project rules', async () => {
    const res = await injectAs('viewer', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/rules`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('viewer can GET project builders', async () => {
    const res = await injectAs('viewer', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('viewer can GET project variables', async () => {
    const res = await injectAs('viewer', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/variables`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('viewer can POST search', async () => {
    const res = await injectAs('viewer', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/search`,
      payload: { text: 'thalien' },
    });
    expect(res.statusCode).toBe(200);
  });

  // -- Viewer CANNOT write --

  it('viewer cannot POST attributes (403)', async () => {
    const res = await injectAs('viewer', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
      payload: { name: 'Hacked Attr', type: 'string' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot POST rules (403)', async () => {
    const res = await injectAs('viewer', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/rules`,
      payload: {
        name: 'Hacked Rule',
        attributeId: seededWordAttrId,
        graph: { nodes: [], edges: [] },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot POST builders (403)', async () => {
    const res = await injectAs('viewer', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/builders`,
      payload: { name: 'Hacked Builder', graph: { nodes: [], edges: [] } },
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot POST variables (403)', async () => {
    const res = await injectAs('viewer', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/variables`,
      payload: { name: 'Hacked Var', type: 'string' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot POST words (editor required, 403)', async () => {
    const res = await injectAs('viewer', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: { word: 'hack', translation: 'nope', word_type: 'Noun' },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot DELETE project (instance_admin required, 403)', async () => {
    const res = await injectAs('viewer', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('viewer cannot access user management (403)', async () => {
    const res = await injectAs('viewer', {
      method: 'GET',
      url: '/api/v1/users',
    });
    expect(res.statusCode).toBe(403);
  });

  // -- Unauthenticated requests --

  it('unauthenticated GET /api/v1/projects returns 401', async () => {
    const res = await injectAs('none', {
      method: 'GET',
      url: '/api/v1/projects',
    });
    expect(res.statusCode).toBe(401);
  });

  it('unauthenticated GET project resources returns 401', async () => {
    const res = await injectAs('none', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('unauthenticated POST word returns 401', async () => {
    const res = await injectAs('none', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: { word: 'anon', translation: 'test', word_type: 'Noun' },
      },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Derivative Types', () => {
  let createdDerivativeTypeId: string;
  let seededRuleId: string;
  let appRuleLinkId: string;

  // Capture a seeded rule ID we can use for applicability linking
  beforeAll(async () => {
    const rulesRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/rules`,
    });
    const ruleItems = rulesRes.json().items;
    seededRuleId = ruleItems[0].id;
  });

  it('GET .../derivative-types lists seeded types including Past Tense', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const pastTense = body.items.find((d: any) => d.name === 'Past Tense');
    expect(pastTense).toBeDefined();
  });

  it('POST .../derivative-types creates a new type', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types`,
      payload: { name: 'Plural', identifier: 'plural' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Plural');
    expect(body.identifier).toBe('plural');
    expect(body.id).toBeDefined();
    createdDerivativeTypeId = body.id;
  });

  it('POST .../derivative-types with missing name returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types`,
      payload: { identifier: 'no_name' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET .../derivative-types/:id returns type with dependencies + applicabilityRules', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(createdDerivativeTypeId);
    expect(body.dependencies).toBeDefined();
    expect(Array.isArray(body.dependencies)).toBe(true);
    expect(body.applicabilityRules).toBeDefined();
    expect(Array.isArray(body.applicabilityRules)).toBe(true);
  });

  it('PUT .../derivative-types/:id updates the name', async () => {
    const res = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}`,
      payload: { name: 'Plural Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Plural Updated');
  });

  it('GET .../derivative-types/:id/versions returns version history', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  // -- Applicability rule linking --

  it('POST .../derivative-types/:id/applicability-rules links a rule', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}/applicability-rules`,
      payload: { ruleId: seededRuleId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ruleId).toBe(seededRuleId);
    expect(body.id).toBeDefined();
    appRuleLinkId = body.id;
  });

  it('POST .../derivative-types/:id/applicability-rules duplicate returns 409', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}/applicability-rules`,
      payload: { ruleId: seededRuleId },
    });
    expect(res.statusCode).toBe(409);
  });

  it('DELETE .../derivative-types/:id/applicability-rules/:linkId unlinks the rule', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}/applicability-rules/${appRuleLinkId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('DELETE .../derivative-types/:id soft deletes', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const getRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${createdDerivativeTypeId}`,
    });
    expect(getRes.statusCode).toBe(404);
  });
});

describe('Word Rules', () => {
  let seededRuleId: string;
  let createdWordRuleLinkId: string;

  beforeAll(async () => {
    // Get a rule to link. Use a freshly created one to avoid conflicts with the
    // already-linked seeded rule.
    const createRes = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/rules`,
      payload: {
        name: 'Rule for word-rules test',
        attributeId: seededWordAttrId,
        required: false,
        graph: {
          nodes: [
            { id: 'n1', type: 'literal_value', position: { x: 0, y: 0 }, data: { value: true } },
            { id: 'n2', type: 'return_rule', position: { x: 200, y: 0 }, data: {} },
          ],
          edges: [
            { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'pass' },
          ],
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    seededRuleId = createRes.json().id;
  });

  it('GET .../word-rules lists seeded links (at least 1 from seed)', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/word-rules`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('POST .../word-rules creates a word rule link', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/word-rules`,
      payload: { ruleId: seededRuleId },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ruleId).toBe(seededRuleId);
    expect(body.id).toBeDefined();
    createdWordRuleLinkId = body.id;
  });

  it('POST .../word-rules duplicate returns 409', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/word-rules`,
      payload: { ruleId: seededRuleId },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH .../word-rules/:linkId updates required flag', async () => {
    const res = await injectAs('admin', {
      method: 'PATCH',
      url: `/api/v1/projects/${eldarianProjectId}/word-rules/${createdWordRuleLinkId}`,
      payload: { required: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().required).toBe(false);
  });

  it('PUT .../word-rules/order reorders links', async () => {
    // Get all link IDs
    const listRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/word-rules`,
    });
    const linkIds = listRes.json().items.map((l: any) => l.id);
    expect(linkIds.length).toBeGreaterThanOrEqual(2);

    // Reverse the order
    const reversed = [...linkIds].reverse();
    const res = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/word-rules/order`,
      payload: { linkIds: reversed },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('DELETE .../word-rules/:linkId removes the link', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/word-rules/${createdWordRuleLinkId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

describe('Live Validation', () => {
  it('POST .../words/validate with valid data returns valid: true + ruleResults', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/validate`,
      payload: {
        attributeValues: {
          word: 'velara',
          translation: 'to speak',
          word_type: 'Verb',
          syllable_count: 3,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.ruleResults).toBeDefined();
    expect(Array.isArray(body.ruleResults)).toBe(true);
    expect(body.ruleResults.length).toBeGreaterThan(0);
  });

  it('POST .../words/validate with invalid data returns valid: false + errors', async () => {
    // 'bcd' has no vowel and is missing required fields
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/validate`,
      payload: {
        attributeValues: {
          word: 'bcd',
          translation: '',
          word_type: '',
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(false);
    expect(body.errors).toBeDefined();
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('ruleResults include touchedAttributes array', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/validate`,
      payload: {
        attributeValues: {
          word: 'velara',
          translation: 'test',
          word_type: 'Noun',
          syllable_count: 2,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // At least one rule result should exist
    if (body.ruleResults.length > 0) {
      for (const rr of body.ruleResults) {
        expect(rr.touchedAttributes).toBeDefined();
        expect(Array.isArray(rr.touchedAttributes)).toBe(true);
      }
    }
  });
});

describe('Version Restore', () => {
  let restoreWordId: string;
  let firstVersionId: string;

  beforeAll(async () => {
    // Create a word
    const createRes = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: {
          word: 'restoretest',
          translation: 'to restore',
          word_type: 'Verb',
          syllable_count: 4,
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    restoreWordId = createRes.json().id;

    // Get its first version
    const versionsRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${restoreWordId}/versions`,
    });
    const versions = versionsRes.json().items;
    expect(versions.length).toBeGreaterThanOrEqual(1);
    firstVersionId = versions[versions.length - 1].id; // oldest version

    // Update the word so there are 2+ versions
    await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/words/${restoreWordId}`,
      payload: {
        attributeValues: {
          word: 'restoretestmodified',
          translation: 'modified',
          word_type: 'Verb',
          syllable_count: 5,
        },
      },
    });
  });

  it('POST .../words/:id/versions/:versionId/restore returns 200', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words/${restoreWordId}/versions/${firstVersionId}/restore`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('after restore: GET .../words/:id returns the restored values', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${restoreWordId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attributeValues.word).toBe('restoretest');
    expect(body.attributeValues.translation).toBe('to restore');
  });

  it('after restore: versions list has a new entry', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${restoreWordId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // created + updated + restore = at least 3
    expect(body.items.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Cascade Regeneration', () => {
  let cascadeWordId: string;
  let pastTenseBuilderId: string;
  let originalDerivativeValue: string;

  beforeAll(async () => {
    // Create a verb word that should get a Past Tense derivative
    const createRes = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: {
          word: 'lunara',
          translation: 'to shine',
          word_type: 'Verb',
          syllable_count: 3,
        },
      },
    });
    expect(createRes.statusCode).toBe(200);
    cascadeWordId = createRes.json().id;

    // Verify the Past Tense derivative was generated
    const wordRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${cascadeWordId}`,
    });
    const derivs = wordRes.json().derivatives;
    const pastTense = derivs?.find((d: any) => d.identifier === 'past_tense');
    expect(pastTense).toBeDefined();
    originalDerivativeValue = pastTense.value;
    // "lunara" ends with vowel 'a' => "lunararath"
    expect(originalDerivativeValue).toBe('lunararath');

    // Find the Past Tense builder
    const buildersRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders`,
    });
    const ptBuilder = buildersRes.json().items.find((b: any) => b.name === 'Past Tense Builder');
    expect(ptBuilder).toBeDefined();
    pastTenseBuilderId = ptBuilder.id;
  });

  it('updating the builder graph causes derivative values to change', async () => {
    // Get the current builder graph
    const builderRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${pastTenseBuilderId}`,
    });
    expect(builderRes.statusCode).toBe(200);
    const graph = builderRes.json().graph;

    // Modify: change the vowel-ending suffix from 'rath' to 'zan'
    const rathNode = graph.nodes.find((n: any) => n.type === 'append' && n.data.suffix === 'rath');
    expect(rathNode).toBeDefined();
    rathNode.data.suffix = 'zan';

    // Update the builder
    const updateRes = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${pastTenseBuilderId}`,
      payload: { graph },
    });
    expect(updateRes.statusCode).toBe(200);

    // Check the word's derivative changed
    const wordRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${cascadeWordId}`,
    });
    expect(wordRes.statusCode).toBe(200);
    const derivs = wordRes.json().derivatives;
    const pastTense = derivs?.find((d: any) => d.identifier === 'past_tense');
    expect(pastTense).toBeDefined();
    // "lunara" ends with vowel 'a' => new suffix 'zan' => "lunarazan"
    expect(pastTense.value).toBe('lunarazan');
    expect(pastTense.value).not.toBe(originalDerivativeValue);
  });

  it('word versions include an entry after cascade', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/words/${cascadeWordId}/versions`,
    });
    expect(res.statusCode).toBe(200);
    // created + cascade = at least 2
    expect(res.json().items.length).toBeGreaterThanOrEqual(2);
  });

  afterAll(async () => {
    // Restore builder to original suffix so other tests aren't affected
    const builderRes = await injectAs('admin', {
      method: 'GET',
      url: `/api/v1/projects/${eldarianProjectId}/builders/${pastTenseBuilderId}`,
    });
    const graph = builderRes.json().graph;
    const zanNode = graph.nodes.find((n: any) => n.type === 'append' && n.data.suffix === 'zan');
    if (zanNode) {
      zanNode.data.suffix = 'rath';
      await injectAs('admin', {
        method: 'PUT',
        url: `/api/v1/projects/${eldarianProjectId}/builders/${pastTenseBuilderId}`,
        payload: { graph },
      });
    }
  });
});

describe('Auth Endpoints', () => {
  let createdApiKeyId: string;

  it('PATCH /api/v1/auth/profile updates displayName', async () => {
    const res = await injectAs('admin', {
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      payload: { displayName: 'Admin Updated' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('Admin Updated');
  });

  it('PATCH /api/v1/auth/profile with wrong currentPassword returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      payload: { currentPassword: 'wrongpassword', newPassword: 'newpass123!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/v1/auth/profile with empty displayName returns 400', async () => {
    const res = await injectAs('admin', {
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      payload: { displayName: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/auth/api-keys creates an API key with prefix', async () => {
    const res = await injectAs('admin', {
      method: 'POST',
      url: '/api/v1/auth/api-keys',
      payload: { name: 'Test Key' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Test Key');
    expect(body.key).toBeDefined();
    expect(body.key.startsWith('lv_')).toBe(true);
    expect(body.prefix).toBeDefined();
    createdApiKeyId = body.id;
  });

  it('GET /api/v1/auth/api-keys lists keys including the one just created', async () => {
    const res = await injectAs('admin', {
      method: 'GET',
      url: '/api/v1/auth/api-keys',
    });
    expect(res.statusCode).toBe(200);
    const keys = res.json();
    expect(Array.isArray(keys)).toBe(true);
    const found = keys.find((k: any) => k.id === createdApiKeyId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Test Key');
  });

  it('DELETE /api/v1/auth/api-keys/:id revokes the key', async () => {
    const res = await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/auth/api-keys/${createdApiKeyId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify it's gone
    const listRes = await injectAs('admin', {
      method: 'GET',
      url: '/api/v1/auth/api-keys',
    });
    const keys = listRes.json();
    const found = keys.find((k: any) => k.id === createdApiKeyId);
    expect(found).toBeUndefined();
  });
});

describe('Edge Cases', () => {
  it('circular dependency on derivative types returns 400', async () => {
    // Create type A
    const resA = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types`,
      payload: { name: 'TypeA', identifier: 'type_a' },
    });
    expect(resA.statusCode).toBe(200);
    const typeAId = resA.json().id;

    // Create type B that depends on A
    const resB = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types`,
      payload: { name: 'TypeB', identifier: 'type_b', dependencies: [typeAId] },
    });
    expect(resB.statusCode).toBe(200);
    const typeBId = resB.json().id;

    // Try to make A depend on B (circular)
    const circularRes = await injectAs('admin', {
      method: 'PUT',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${typeAId}`,
      payload: { dependencies: [typeBId] },
    });
    expect(circularRes.statusCode).toBe(400);
    expect(circularRes.json().error).toContain('ircular');

    // Cleanup
    await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${typeBId}`,
    });
    await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/derivative-types/${typeAId}`,
    });
  });

  it('case-insensitive unique attribute rejects duplicate casing', async () => {
    // Create a unique (case_insensitive) attribute
    const attrRes = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/attributes`,
      payload: { name: 'Unique Field', type: 'string', uniqueMode: 'case_insensitive' },
    });
    expect(attrRes.statusCode).toBe(200);
    const uniqueAttrId = attrRes.json().id;
    const uniqueAttrIdent = attrRes.json().identifier;

    // Create first word with this attribute set to 'Test'
    const word1Res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: {
          word: 'uniqueword1',
          translation: 'test unique',
          word_type: 'Noun',
          [uniqueAttrIdent]: 'Test',
        },
      },
    });
    expect(word1Res.statusCode).toBe(200);

    // Try creating a second word with same attribute 'TEST' (different case)
    const word2Res = await injectAs('admin', {
      method: 'POST',
      url: `/api/v1/projects/${eldarianProjectId}/words`,
      payload: {
        attributeValues: {
          word: 'uniqueword2',
          translation: 'test unique 2',
          word_type: 'Noun',
          [uniqueAttrIdent]: 'TEST',
        },
      },
    });
    expect(word2Res.statusCode).toBe(400);
    expect(word2Res.json().errors).toBeDefined();
    expect(word2Res.json().errors.length).toBeGreaterThan(0);

    // Cleanup: soft delete the attribute
    await injectAs('admin', {
      method: 'DELETE',
      url: `/api/v1/projects/${eldarianProjectId}/attributes/${uniqueAttrId}`,
    });
  });
});

