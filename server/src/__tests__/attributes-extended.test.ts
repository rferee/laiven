import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('@fastify/rate-limit', () => ({
  default: async () => {},
  __esModule: true,
}));

import {
  setupTestApp, teardownTestApp, inject, injectNoAuth,
  createUserAndLogin, addProjectMember, getAttributeId, getVariableId,
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

const BASE = (pid: string) => `/api/v1/projects/${pid}/attributes`;
const WORDS_BASE = (pid: string) => `/api/v1/projects/${pid}/words`;

// Helper to create an attribute and return the response body
async function createAttribute(overrides: Record<string, unknown> = {}) {
  const payload = { name: `AttrTest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type: 'string', ...overrides };
  const res = await inject(app, adminCookies, { method: 'POST', url: BASE(projectId), payload });
  return { res, body: JSON.parse(res.body) };
}

// Helper to create a word with required fields + extras
async function createWord(extraValues: Record<string, unknown> = {}) {
  const payload = {
    attributeValues: {
      word: `testword-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      translation: 'test translation',
      word_type: 'Noun',
      ...extraValues,
    },
  };
  const res = await inject(app, adminCookies, { method: 'POST', url: WORDS_BASE(projectId), payload });
  return { res, body: JSON.parse(res.body) };
}

// Helper to delete an attribute for cleanup
async function deleteAttribute(id: string) {
  await inject(app, adminCookies, { method: 'DELETE', url: `${BASE(projectId)}/${id}` });
}

describe('Attributes Extended', () => {
  // 1. Create attribute of type 'string'
  it('should create a string attribute with id, name, type, and generated identifier', async () => {
    const { res, body } = await createAttribute({ name: 'AttrTest-StringType', type: 'string' });
    expect(res.statusCode).toBe(200);
    expect(body.id).toBeDefined();
    expect(body.name).toBe('AttrTest-StringType');
    expect(body.type).toBe('string');
    expect(body.identifier).toBeDefined();
    expect(typeof body.identifier).toBe('string');
    await deleteAttribute(body.id);
  });

  // 2. Create attribute of type 'one_of' with options
  it('should create a one_of attribute with options', async () => {
    const { res, body } = await createAttribute({
      name: 'AttrTest-OneOfColors',
      type: 'one_of',
      options: ['Red', 'Green', 'Blue'],
    });
    expect(res.statusCode).toBe(200);
    expect(body.type).toBe('one-of');
    expect(body.options).toBeDefined();
    expect(body.options).toEqual(expect.arrayContaining(['Red', 'Green', 'Blue']));
    await deleteAttribute(body.id);
  });

  // 3. Create attribute of type 'integer'
  it('should create an integer attribute', async () => {
    const { res, body } = await createAttribute({ name: 'AttrTest-IntegerType', type: 'integer' });
    expect(res.statusCode).toBe(200);
    expect(body.type).toBe('integer');
    await deleteAttribute(body.id);
  });

  // 4. Create attribute of type 'boolean'
  it('should create a boolean attribute', async () => {
    const { res, body } = await createAttribute({ name: 'AttrTest-BooleanType', type: 'boolean' });
    expect(res.statusCode).toBe(200);
    expect(body.type).toBe('boolean');
    await deleteAttribute(body.id);
  });

  // 5. Create attribute of type 'single_relation'
  it('should create a single_relation attribute', async () => {
    const { res, body } = await createAttribute({ name: 'AttrTest-SingleRelation', type: 'single_relation' });
    expect(res.statusCode).toBe(200);
    expect(body.type).toBe('single-relation');
    await deleteAttribute(body.id);
  });

  // 6. Create attribute of type 'multiple_relation'
  it('should create a multiple_relation attribute', async () => {
    const { res, body } = await createAttribute({ name: 'AttrTest-MultipleRelation', type: 'multiple_relation' });
    expect(res.statusCode).toBe(200);
    expect(body.type).toBe('multiple-relation');
    await deleteAttribute(body.id);
  });

  // 7. Required attribute — word without it returns 400
  it('should reject a word missing a required attribute', async () => {
    const { body: attr } = await createAttribute({ name: 'AttrTest-RequiredField', type: 'string', required: true });
    expect(attr.id).toBeDefined();

    // Create a word without the required attribute — should fail
    const { res: wordRes } = await createWord();
    expect(wordRes.statusCode).toBe(400);

    await deleteAttribute(attr.id);
  });

  // 8. Optional attribute — word without it succeeds
  it('should allow a word without an optional attribute', async () => {
    const { body: attr } = await createAttribute({ name: 'AttrTest-OptionalField', type: 'string', required: false });
    expect(attr.id).toBeDefined();

    const { res: wordRes } = await createWord();
    expect(wordRes.statusCode).toBe(200);

    await deleteAttribute(attr.id);
  });

  // 9. uniqueMode 'case_sensitive' — exact match fails, different case succeeds
  it('should enforce case_sensitive uniqueness', async () => {
    const { body: attr } = await createAttribute({
      name: 'AttrTest-UniqCaseSensitive',
      type: 'string',
      uniqueMode: 'case_sensitive',
    });
    expect(attr.id).toBeDefined();
    const identifier = attr.identifier;

    // Create first word with value
    const { res: w1Res } = await createWord({ [identifier]: 'UniqueVal' });
    expect(w1Res.statusCode).toBe(200);

    // Create second word with exact same value — should fail
    const { res: w2Res } = await createWord({ [identifier]: 'UniqueVal' });
    expect(w2Res.statusCode).toBeGreaterThanOrEqual(400);

    // Create third word with different case — should succeed
    const { res: w3Res } = await createWord({ [identifier]: 'uniqueval' });
    expect(w3Res.statusCode).toBe(200);

    await deleteAttribute(attr.id);
  });

  // 10. uniqueMode 'case_insensitive' — any case duplicate fails
  it('should enforce case_insensitive uniqueness', async () => {
    const { body: attr } = await createAttribute({
      name: 'AttrTest-UniqCaseInsensitive',
      type: 'string',
      uniqueMode: 'case_insensitive',
    });
    expect(attr.id).toBeDefined();
    const identifier = attr.identifier;

    const { res: w1Res } = await createWord({ [identifier]: 'CaseTest' });
    expect(w1Res.statusCode).toBe(200);

    // Same value different case — should fail
    const { res: w2Res } = await createWord({ [identifier]: 'casetest' });
    expect(w2Res.statusCode).toBeGreaterThanOrEqual(400);

    // Same exact value — should also fail
    const { res: w3Res } = await createWord({ [identifier]: 'CaseTest' });
    expect(w3Res.statusCode).toBeGreaterThanOrEqual(400);

    await deleteAttribute(attr.id);
  });

  // 11. uniqueMode 'off' — duplicates succeed
  it('should allow duplicate values when uniqueMode is off', async () => {
    const { body: attr } = await createAttribute({
      name: 'AttrTest-UniqOff',
      type: 'string',
      uniqueMode: 'off',
    });
    expect(attr.id).toBeDefined();
    const identifier = attr.identifier;

    const { res: w1Res } = await createWord({ [identifier]: 'DupeOk' });
    expect(w1Res.statusCode).toBe(200);

    const { res: w2Res } = await createWord({ [identifier]: 'DupeOk' });
    expect(w2Res.statusCode).toBe(200);

    await deleteAttribute(attr.id);
  });

  // 12. one_of with empty options array
  it('should handle one_of attribute with empty options', async () => {
    const { res, body } = await createAttribute({
      name: 'AttrTest-EmptyOneOf',
      type: 'one_of',
      options: [],
    });
    // Might succeed with empty options or reject — either is valid, just check it doesn't crash
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      await deleteAttribute(body.id);
    }
  });

  // 13. one_of with duplicate options
  it('should handle one_of attribute with duplicate options', async () => {
    const { res, body } = await createAttribute({
      name: 'AttrTest-DupeOptions',
      type: 'one_of',
      options: ['Alpha', 'Alpha', 'Beta'],
    });
    // Might deduplicate or reject — either is valid behavior
    expect([200, 400, 409]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      await deleteAttribute(body.id);
    }
  });

  // 14. Duplicate attribute name in same project returns 409
  it('should return 409 for duplicate attribute name in same project', async () => {
    const uniqueName = `AttrTest-DupeName-${Date.now()}`;
    const { res: r1, body: b1 } = await createAttribute({ name: uniqueName, type: 'string' });
    expect(r1.statusCode).toBe(200);

    const { res: r2 } = await createAttribute({ name: uniqueName, type: 'string' });
    expect(r2.statusCode).toBe(409);

    await deleteAttribute(b1.id);
  });

  // 15. Same attribute name in a different project succeeds
  it('should allow same attribute name in a different project', async () => {
    const uniqueName = `AttrTest-CrossProject-${Date.now()}`;

    // Create attribute in Eldarian project
    const { res: r1, body: b1 } = await createAttribute({ name: uniqueName, type: 'string' });
    expect(r1.statusCode).toBe(200);

    // Create a second project
    const projRes = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: `TestProj-${Date.now()}`, description: 'Cross-project attr test' },
    });
    expect(projRes.statusCode).toBe(200);
    const proj2 = JSON.parse(projRes.body);

    // Create attribute with same name in second project
    const r2 = await inject(app, adminCookies, {
      method: 'POST',
      url: BASE(proj2.id),
      payload: { name: uniqueName, type: 'string' },
    });
    expect(r2.statusCode).toBe(200);

    // Cleanup
    await deleteAttribute(b1.id);
    const b2 = JSON.parse(r2.body);
    await inject(app, adminCookies, { method: 'DELETE', url: `${BASE(proj2.id)}/${b2.id}` });
  });

  // 16. Delete attribute — word with that attribute still accessible
  it('should allow accessing a word after its attribute is deleted', async () => {
    const { body: attr } = await createAttribute({ name: 'AttrTest-DeleteCheck', type: 'string' });
    expect(attr.id).toBeDefined();
    const identifier = attr.identifier;

    const { res: wordRes, body: wordBody } = await createWord({ [identifier]: 'someValue' });
    expect(wordRes.statusCode).toBe(200);

    // Delete the attribute
    await deleteAttribute(attr.id);

    // Word should still be accessible
    const getWordRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${WORDS_BASE(projectId)}/${wordBody.id}`,
    });
    expect(getWordRes.statusCode).toBe(200);
  });

  // 17. Reorder attributes via PATCH .../order
  it('should update displayOrder when reordering attributes', async () => {
    const { body: attrA } = await createAttribute({ name: 'AttrTest-OrderA', type: 'string' });
    const { body: attrB } = await createAttribute({ name: 'AttrTest-OrderB', type: 'string' });

    // Set attrA to displayOrder 10
    const patchA = await inject(app, adminCookies, {
      method: 'PATCH',
      url: `${BASE(projectId)}/${attrA.id}/order`,
      payload: { displayOrder: 10 },
    });
    expect(patchA.statusCode).toBeLessThan(300);

    // Set attrB to displayOrder 5
    const patchB = await inject(app, adminCookies, {
      method: 'PATCH',
      url: `${BASE(projectId)}/${attrB.id}/order`,
      payload: { displayOrder: 5 },
    });
    expect(patchB.statusCode).toBeLessThan(300);

    // Fetch both and verify order
    const getA = await inject(app, adminCookies, { method: 'GET', url: `${BASE(projectId)}/${attrA.id}` });
    const getB = await inject(app, adminCookies, { method: 'GET', url: `${BASE(projectId)}/${attrB.id}` });
    const bodyA = JSON.parse(getA.body);
    const bodyB = JSON.parse(getB.body);

    expect(bodyA.displayOrder).toBe(10);
    expect(bodyB.displayOrder).toBe(5);

    await deleteAttribute(attrA.id);
    await deleteAttribute(attrB.id);
  });

  // 18. Auto-generated identifier from name
  it('should auto-generate an identifier from the attribute name', async () => {
    const { body } = await createAttribute({ name: 'My Cool Attr', type: 'string' });
    expect(body.identifier).toBeDefined();
    // Identifier should be lowercase, snake_case or similar
    expect(body.identifier).toMatch(/^[a-z0-9_]+$/);
    expect(body.identifier).toContain('my');
    expect(body.identifier).toContain('cool');
    expect(body.identifier).toContain('attr');
    await deleteAttribute(body.id);
  });

  // 19. Auto-generated identifier from name with special chars and unicode
  it('should auto-generate identifier from name with special chars', async () => {
    const { res, body } = await createAttribute({ name: 'Über Spëcial Char!@#$', type: 'string' });
    expect(res.statusCode).toBe(200);
    expect(body.identifier).toBeDefined();
    // Identifier should only contain safe characters
    expect(body.identifier).toMatch(/^[a-z0-9_]+$/);
    await deleteAttribute(body.id);
  });

  // 20. Version history for attribute: create, update, check versions
  it('should track version history for attribute create and update', async () => {
    const { body: attr } = await createAttribute({ name: 'AttrTest-Versions', type: 'string' });
    expect(attr.id).toBeDefined();

    // Update the attribute
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${BASE(projectId)}/${attr.id}`,
      payload: { name: 'AttrTest-Versions-Updated', type: 'string' },
    });
    expect(updateRes.statusCode).toBeLessThan(300);

    // Fetch version history
    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${BASE(projectId)}/${attr.id}/versions`,
    });
    expect(versionsRes.statusCode).toBe(200);
    const versions = versionsRes.json().items;
    expect(Array.isArray(versions)).toBe(true);
    expect(versions.length).toBeGreaterThanOrEqual(2);

    const changeTypes = versions.map((v: { changeType: string }) => v.changeType);
    expect(changeTypes).toContain('created');
    expect(changeTypes).toContain('updated');

    await deleteAttribute(attr.id);
  });
});
