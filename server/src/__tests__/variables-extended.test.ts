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

const BASE = (pid: string) => `/api/v1/projects/${pid}/variables`;

// Helper to create a variable and return the response body
async function createVariable(overrides: Record<string, unknown> = {}) {
  const payload = {
    name: `VarTest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'array',
    dataType: 'string',
    items: [{ value: 'default1' }, { value: 'default2' }],
    ...overrides,
  };
  const res = await inject(app, adminCookies, { method: 'POST', url: BASE(projectId), payload });
  return { res, body: JSON.parse(res.body) };
}

// Helper to delete a variable for cleanup
async function deleteVariable(id: string) {
  await inject(app, adminCookies, { method: 'DELETE', url: `${BASE(projectId)}/${id}` });
}

describe('Variables Extended', () => {
  // 1. Create constant variable of dataType 'string' with single item
  it('should create a constant string variable with a single item', async () => {
    const { res, body } = await createVariable({
      name: 'VarTest-ConstString',
      kind: 'constant',
      dataType: 'string',
      items: [{ value: 'hello' }],
    });
    expect(res.statusCode).toBe(200);
    expect(body.name).toBe('VarTest-ConstString');
    expect(body.kind).toBe('constant');
    expect(body.dataType).toBe('string');
    expect(body.items).toBeDefined();
    expect(body.items.length).toBe(1);
    expect(body.items[0].value).toBe('hello');
    await deleteVariable(body.id);
  });

  // 2. Create constant variable of dataType 'integer' with single item
  it('should create a constant integer variable with a single item', async () => {
    const { res, body } = await createVariable({
      name: 'VarTest-ConstInteger',
      kind: 'constant',
      dataType: 'integer',
      items: [{ value: '42' }],
    });
    expect(res.statusCode).toBe(200);
    expect(body.kind).toBe('constant');
    expect(body.dataType).toBe('integer');
    expect(body.items.length).toBe(1);
    await deleteVariable(body.id);
  });

  // 3. Create constant variable of dataType 'boolean' with single item
  it('should create a constant boolean variable with a single item', async () => {
    const { res, body } = await createVariable({
      name: 'VarTest-ConstBool',
      kind: 'constant',
      dataType: 'boolean',
      items: [{ value: 'true' }],
    });
    expect(res.statusCode).toBe(200);
    expect(body.kind).toBe('constant');
    expect(body.dataType).toBe('boolean');
    expect(body.items.length).toBe(1);
    await deleteVariable(body.id);
  });

  // 4. Create array variable of dataType 'string' with multiple items
  it('should create an array string variable with multiple items', async () => {
    const { res, body } = await createVariable({
      name: 'VarTest-ArrayString',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'alpha' }, { value: 'beta' }, { value: 'gamma' }],
    });
    expect(res.statusCode).toBe(200);
    expect(body.kind).toBe('array');
    expect(body.dataType).toBe('string');
    expect(body.items.length).toBe(3);
    const values = body.items.map((i: { value: string }) => i.value);
    expect(values).toContain('alpha');
    expect(values).toContain('beta');
    expect(values).toContain('gamma');
    await deleteVariable(body.id);
  });

  // 5. Create array variable of dataType 'integer' with multiple items
  it('should create an array integer variable with multiple items', async () => {
    const { res, body } = await createVariable({
      name: 'VarTest-ArrayInteger',
      kind: 'array',
      dataType: 'integer',
      items: [{ value: '1' }, { value: '2' }, { value: '3' }],
    });
    expect(res.statusCode).toBe(200);
    expect(body.kind).toBe('array');
    expect(body.dataType).toBe('integer');
    expect(body.items.length).toBe(3);
    await deleteVariable(body.id);
  });

  // 6. Create array variable with empty items list
  it('should handle creating an array variable with empty items', async () => {
    const { res, body } = await createVariable({
      name: 'VarTest-EmptyItems',
      kind: 'array',
      dataType: 'string',
      items: [],
    });
    // Should succeed with 0 items or reject — either is valid
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(body.items).toBeDefined();
      expect(body.items.length).toBe(0);
      await deleteVariable(body.id);
    }
  });

  // 7. Create array variable with items containing empty string values
  it('should handle creating a variable with empty string item values', async () => {
    const { res, body } = await createVariable({
      name: 'VarTest-EmptyStringItems',
      kind: 'array',
      dataType: 'string',
      items: [{ value: '' }, { value: 'notempty' }, { value: '' }],
    });
    // May succeed or reject empty strings — either is valid
    expect([200, 400]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      await deleteVariable(body.id);
    }
  });

  // 8. Update variable kind from 'array' to 'constant'
  it('should update variable kind from array to constant', async () => {
    const { body: created } = await createVariable({
      name: 'VarTest-ArrayToConst',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'x' }, { value: 'y' }],
    });
    expect(created.kind).toBe('array');

    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${BASE(projectId)}/${created.id}`,
      payload: { kind: 'constant', items: [{ value: 'only-one' }] },
    });
    expect(updateRes.statusCode).toBeLessThan(300);
    const updated = JSON.parse(updateRes.body);
    expect(updated.kind).toBe('constant');

    await deleteVariable(created.id);
  });

  // 9. Update variable kind from 'constant' to 'array'
  it('should update variable kind from constant to array', async () => {
    const { body: created } = await createVariable({
      name: 'VarTest-ConstToArray',
      kind: 'constant',
      dataType: 'string',
      items: [{ value: 'single' }],
    });
    expect(created.kind).toBe('constant');

    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${BASE(projectId)}/${created.id}`,
      payload: { kind: 'array', items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }] },
    });
    expect(updateRes.statusCode).toBeLessThan(300);
    const updated = JSON.parse(updateRes.body);
    expect(updated.kind).toBe('array');

    await deleteVariable(created.id);
  });

  // 10. Update variable items — add new items, verify count changes
  it('should increase item count when adding items via update', async () => {
    const { body: created } = await createVariable({
      name: 'VarTest-AddItems',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'one' }, { value: 'two' }],
    });
    expect(created.items.length).toBe(2);

    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${BASE(projectId)}/${created.id}`,
      payload: { items: [{ value: 'one' }, { value: 'two' }, { value: 'three' }, { value: 'four' }] },
    });
    expect(updateRes.statusCode).toBeLessThan(300);
    const updated = JSON.parse(updateRes.body);
    expect(updated.items.length).toBe(4);

    await deleteVariable(created.id);
  });

  // 11. Update variable items — remove items, verify count changes
  it('should decrease item count when removing items via update', async () => {
    const { body: created } = await createVariable({
      name: 'VarTest-RemoveItems',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }],
    });
    expect(created.items.length).toBe(4);

    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${BASE(projectId)}/${created.id}`,
      payload: { items: [{ value: 'a' }] },
    });
    expect(updateRes.statusCode).toBeLessThan(300);
    const updated = JSON.parse(updateRes.body);
    expect(updated.items.length).toBe(1);

    await deleteVariable(created.id);
  });

  // 12. Delete variable and verify it's gone (GET returns 404)
  it('should return 404 after deleting a variable', async () => {
    const { body: created } = await createVariable({
      name: 'VarTest-DeleteGone',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'temp' }],
    });
    expect(created.id).toBeDefined();

    // Delete it
    const deleteRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `${BASE(projectId)}/${created.id}`,
    });
    expect(deleteRes.statusCode).toBeLessThan(300);

    // GET should return 404
    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${BASE(projectId)}/${created.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  // 13. Version history for variable: create, update, verify entries
  it('should track version history for variable create and update', async () => {
    const { body: created } = await createVariable({
      name: 'VarTest-Versions',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'v1' }],
    });
    expect(created.id).toBeDefined();

    // Update the variable
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${BASE(projectId)}/${created.id}`,
      payload: { name: 'VarTest-Versions-Updated', items: [{ value: 'v1' }, { value: 'v2' }] },
    });
    expect(updateRes.statusCode).toBeLessThan(300);

    // Fetch version history
    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${BASE(projectId)}/${created.id}/versions`,
    });
    expect(versionsRes.statusCode).toBe(200);
    const versions = JSON.parse(versionsRes.body).items;
    expect(Array.isArray(versions)).toBe(true);
    expect(versions.length).toBeGreaterThanOrEqual(2);

    const changeTypes = versions.map((v: { changeType: string }) => v.changeType);
    expect(changeTypes).toContain('created');
    expect(changeTypes).toContain('updated');

    await deleteVariable(created.id);
  });

  // 14. Create variable without name returns 400
  it('should return 400 when creating a variable without a name', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: BASE(projectId),
      payload: {
        kind: 'array',
        dataType: 'string',
        items: [{ value: 'orphan' }],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // 15. Create variable with duplicate name — verify behavior
  it('should handle creating a variable with a duplicate name', async () => {
    const uniqueName = `VarTest-DupeName-${Date.now()}`;
    const { res: r1, body: b1 } = await createVariable({ name: uniqueName });
    expect(r1.statusCode).toBe(200);

    const { res: r2, body: b2 } = await createVariable({ name: uniqueName });
    // Duplicate variable names are allowed by design
    expect(r2.statusCode).toBe(200);

    await deleteVariable(b1.id);
    await deleteVariable(b2.id);
  });

  // 16. Constant variable through the node engine: single value, not array
  it('should return a single string (not array) from variable_reference for constant variable', async () => {
    // Create a constant variable
    const { res: varRes, body: variable } = await createVariable({
      name: 'VarTest-ConstNodeEngine',
      kind: 'constant',
      dataType: 'string',
      items: [{ value: 'Eldarian' }],
    });
    expect(varRes.statusCode).toBe(200);

    // Create a rule that uses variable_reference wired to equals against a literal
    // Graph: variable_reference(VarTest-ConstNodeEngine) -> equals(literal 'Eldarian') -> return_rule
    const ruleRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules`,
      payload: {
        name: 'test-rule-const-var-ref',
        graph: {
          nodes: [
            { id: 'v1', type: 'variable_reference', position: { x: 0, y: 0 }, data: { variableName: 'VarTest-ConstNodeEngine' } },
            { id: 'lit1', type: 'literal_value', position: { x: 0, y: 200 }, data: { value: 'Eldarian' } },
            { id: 'eq1', type: 'equals', position: { x: 300, y: 0 }, data: {} },
            { id: 'r1', type: 'return_rule', position: { x: 500, y: 0 }, data: { message: 'Const check' } },
          ],
          edges: [
            { id: 'e1', source: 'v1', sourceHandle: 'output', target: 'eq1', targetHandle: 'a' },
            { id: 'e2', source: 'lit1', sourceHandle: 'output', target: 'eq1', targetHandle: 'b' },
            { id: 'e3', source: 'eq1', sourceHandle: 'output', target: 'r1', targetHandle: 'pass' },
          ],
        },
      },
    });
    expect(ruleRes.statusCode).toBe(200);
    const rule = JSON.parse(ruleRes.body);

    // Test the rule - the variable_reference for a constant should return the single string 'Eldarian'
    // which should equal the literal 'Eldarian', so pass = true
    const testRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules/${rule.id}/test`,
      payload: { attributeValues: { word: 'anything', translation: 'anything', word_type: 'Noun' } },
    });
    expect(testRes.statusCode).toBe(200);
    const testResult = JSON.parse(testRes.body);
    expect(testResult.pass).toBe(true);

    // Cleanup
    await inject(app, adminCookies, { method: 'DELETE', url: `/api/v1/projects/${projectId}/rules/${rule.id}` });
    await deleteVariable(variable.id);
  });

  // 17. Array variable through the node engine with contains_one_of
  it('should return array from variable_reference for array variable, usable with contains_one_of', async () => {
    // Create an array variable with items ['a', 'b', 'c']
    const { res: varRes, body: variable } = await createVariable({
      name: 'VarTest-ArrayNodeEngine',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
    });
    expect(varRes.statusCode).toBe(200);

    // Create a rule: attribute_input(word) + variable_reference -> contains_one_of -> return_rule
    const ruleRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules`,
      payload: {
        name: 'test-rule-array-var-ref',
        graph: {
          nodes: [
            { id: 'a1', type: 'attribute_input', position: { x: 0, y: 0 }, data: { attributeIdentifier: 'word' } },
            { id: 'v1', type: 'variable_reference', position: { x: 0, y: 200 }, data: { variableName: 'VarTest-ArrayNodeEngine' } },
            { id: 'c1', type: 'contains_one_of', position: { x: 300, y: 0 }, data: {} },
            { id: 'r1', type: 'return_rule', position: { x: 500, y: 0 }, data: { message: 'Array check' } },
          ],
          edges: [
            { id: 'e1', source: 'a1', sourceHandle: 'output', target: 'c1', targetHandle: 'input' },
            { id: 'e2', source: 'v1', sourceHandle: 'output', target: 'c1', targetHandle: 'items' },
            { id: 'e3', source: 'c1', sourceHandle: 'output', target: 'r1', targetHandle: 'pass' },
          ],
        },
      },
    });
    expect(ruleRes.statusCode).toBe(200);
    const rule = JSON.parse(ruleRes.body);

    // Test with 'abc' which contains 'a', 'b', and 'c' => should pass
    const testRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules/${rule.id}/test`,
      payload: { attributeValues: { word: 'abc', translation: 'test', word_type: 'Noun' } },
    });
    expect(testRes.statusCode).toBe(200);
    const testResult = JSON.parse(testRes.body);
    expect(testResult.pass).toBe(true);

    // Cleanup
    await inject(app, adminCookies, { method: 'DELETE', url: `/api/v1/projects/${projectId}/rules/${rule.id}` });
    await deleteVariable(variable.id);
  });

  // 18. Update variable kind from constant to array and verify items
  it('should update variable kind from constant to array with multiple items', async () => {
    const { body: created } = await createVariable({
      name: 'VarTest-KindSwitch',
      kind: 'constant',
      dataType: 'string',
      items: [{ value: 'single' }],
    });
    expect(created.kind).toBe('constant');
    expect(created.items.length).toBe(1);

    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${BASE(projectId)}/${created.id}`,
      payload: { kind: 'array', items: [{ value: 'first' }, { value: 'second' }, { value: 'third' }] },
    });
    expect(updateRes.statusCode).toBeLessThan(300);

    // Verify via GET
    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${BASE(projectId)}/${created.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const fetched = JSON.parse(getRes.body);
    expect(fetched.kind).toBe('array');
    expect(fetched.items.length).toBe(3);
    const values = fetched.items.map((i: { value: string }) => i.value);
    expect(values).toContain('first');
    expect(values).toContain('second');
    expect(values).toContain('third');

    await deleteVariable(created.id);
  });

  // 19. Delete variable referenced in a rule graph — rule handles missing variable gracefully
  it('should handle deleted variable gracefully in rule test (no crash)', async () => {
    // Create a variable
    const { body: variable } = await createVariable({
      name: 'VarTest-DeletedRef',
      kind: 'array',
      dataType: 'string',
      items: [{ value: 'x' }, { value: 'y' }],
    });

    // Create a rule that references the variable
    const ruleRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules`,
      payload: {
        name: 'test-rule-deleted-var',
        graph: {
          nodes: [
            { id: 'a1', type: 'attribute_input', position: { x: 0, y: 0 }, data: { attributeIdentifier: 'word' } },
            { id: 'v1', type: 'variable_reference', position: { x: 0, y: 200 }, data: { variableName: 'VarTest-DeletedRef' } },
            { id: 'c1', type: 'contains_one_of', position: { x: 300, y: 0 }, data: {} },
            { id: 'r1', type: 'return_rule', position: { x: 500, y: 0 }, data: { message: 'Deleted var check' } },
          ],
          edges: [
            { id: 'e1', source: 'a1', sourceHandle: 'output', target: 'c1', targetHandle: 'input' },
            { id: 'e2', source: 'v1', sourceHandle: 'output', target: 'c1', targetHandle: 'items' },
            { id: 'e3', source: 'c1', sourceHandle: 'output', target: 'r1', targetHandle: 'pass' },
          ],
        },
      },
    });
    expect(ruleRes.statusCode).toBe(200);
    const rule = JSON.parse(ruleRes.body);

    // Verify it works before deletion
    const testBefore = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules/${rule.id}/test`,
      payload: { attributeValues: { word: 'xyz', translation: 'test', word_type: 'Noun' } },
    });
    expect(testBefore.statusCode).toBe(200);

    // Delete the variable
    await deleteVariable(variable.id);

    // Test the rule again — should NOT crash (500), should return a result gracefully
    const testAfter = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${projectId}/rules/${rule.id}/test`,
      payload: { attributeValues: { word: 'xyz', translation: 'test', word_type: 'Noun' } },
    });
    expect(testAfter.statusCode).toBe(200);
    const result = JSON.parse(testAfter.body);
    // With the variable gone, variable_reference returns null, contains_one_of gets null items => false
    expect(result.pass).toBe(false);

    // Cleanup
    await inject(app, adminCookies, { method: 'DELETE', url: `/api/v1/projects/${projectId}/rules/${rule.id}` });
  });
});
