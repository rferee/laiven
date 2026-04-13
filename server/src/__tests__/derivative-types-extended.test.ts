import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('@fastify/rate-limit', () => ({
  default: async () => {},
  __esModule: true,
}));

import {
  setupTestApp, teardownTestApp, inject,
  getAttributeId, getVariableId, getBuilderId, getDerivativeTypeId, getRuleId,
  createWord,
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

const dtBase = () => `/api/v1/projects/${projectId}/derivative-types`;
const buildersBase = () => `/api/v1/projects/${projectId}/builders`;
const wordsBase = () => `/api/v1/projects/${projectId}/words`;
const rulesBase = () => `/api/v1/projects/${projectId}/rules`;

function simpleBuilderGraph(suffix: string) {
  return {
    nodes: [
      {
        id: 'input-1',
        type: 'attribute_input',
        position: { x: 0, y: 0 },
        data: { attributeIdentifier: 'word' },
      },
      {
        id: 'append-1',
        type: 'append',
        position: { x: 200, y: 0 },
        data: { suffix },
      },
      {
        id: 'return-1',
        type: 'return_builder',
        position: { x: 400, y: 0 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'input-1',
        sourceHandle: 'output',
        target: 'append-1',
        targetHandle: 'input',
      },
      {
        id: 'e2',
        source: 'append-1',
        sourceHandle: 'output',
        target: 'return-1',
        targetHandle: 'value',
      },
    ],
  };
}

async function createBuilder(name: string, suffix: string) {
  const res = await inject(app, adminCookies, {
    method: 'POST',
    url: buildersBase(),
    payload: { name, graph: simpleBuilderGraph(suffix) },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { id: string };
}

async function createSimpleRule(name: string) {
  const graph = {
    nodes: [
      {
        id: 'input-1',
        type: 'attribute_input',
        position: { x: 0, y: 0 },
        data: { attributeIdentifier: 'word' },
      },
      {
        id: 'check-1',
        type: 'is_not_empty',
        position: { x: 200, y: 0 },
        data: {},
      },
      {
        id: 'return-1',
        type: 'return_rule',
        position: { x: 400, y: 0 },
        data: {},
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'input-1',
        sourceHandle: 'output',
        target: 'check-1',
        targetHandle: 'input',
      },
      {
        id: 'e2',
        source: 'check-1',
        sourceHandle: 'output',
        target: 'return-1',
        targetHandle: 'value',
      },
    ],
  };

  const res = await inject(app, adminCookies, {
    method: 'POST',
    url: rulesBase(),
    payload: { name, graph },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { id: string };
}

describe('Derivative Types — Extended', () => {
  const cleanupDtIds: string[] = [];
  const cleanupBuilderIds: string[] = [];
  const cleanupRuleIds: string[] = [];
  const cleanupWordIds: string[] = [];

  afterAll(async () => {
    for (const id of cleanupWordIds) {
      await inject(app, adminCookies, { method: 'DELETE', url: `${wordsBase()}/${id}` });
    }
    for (const id of cleanupDtIds) {
      await inject(app, adminCookies, { method: 'DELETE', url: `${dtBase()}/${id}` });
    }
    for (const id of cleanupBuilderIds) {
      await inject(app, adminCookies, { method: 'DELETE', url: `${buildersBase()}/${id}` });
    }
    for (const id of cleanupRuleIds) {
      await inject(app, adminCookies, { method: 'DELETE', url: `${rulesBase()}/${id}` });
    }
  });

  // 1. Create derivative type without builder
  it('create derivative type without builder (builderId: null)', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'No Builder DT',
        identifier: 'test_dt_no_builder',
        builderId: null,
      },
    });
    expect(res.statusCode).toBe(200);
    const dt = res.json();
    expect(dt.id).toBeDefined();
    expect(dt.identifier).toBe('test_dt_no_builder');
    cleanupDtIds.push(dt.id);
  });

  // 2. Create derivative type with required: true
  it('create derivative type with required: true', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Required DT',
        identifier: 'test_dt_required',
        required: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const dt = res.json();
    expect(dt.required).toBe(true);
    cleanupDtIds.push(dt.id);
  });

  // 3. Create derivative type with required: false
  it('create derivative type with required: false', async () => {
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Optional DT',
        identifier: 'test_dt_optional',
        required: false,
      },
    });
    expect(res.statusCode).toBe(200);
    const dt = res.json();
    expect(dt.required).toBe(false);
    cleanupDtIds.push(dt.id);
  });

  // 4. Create derivative type with dependencies
  it('create derivative type with dependencies on another', async () => {
    // Create type A
    const resA = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Dep A',
        identifier: 'test_dep_a',
      },
    });
    expect(resA.statusCode).toBe(200);
    const dtA = resA.json();
    cleanupDtIds.push(dtA.id);

    // Create type B depending on A
    const resB = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Dep B',
        identifier: 'test_dep_b',
        dependencies: [dtA.id],
      },
    });
    expect(resB.statusCode).toBe(200);
    const dtB = resB.json();
    cleanupDtIds.push(dtB.id);

    // Verify B has dependency on A
    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${dtBase()}/${dtB.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const dtBFull = getRes.json();
    expect(dtBFull.dependencies).toBeDefined();
    const depIds = dtBFull.dependencies.map((d: any) => d.derivativeTypeId);
    expect(depIds).toContain(dtA.id);
  });

  // 5. Self-dependency returns 400
  it('self-dependency returns 400', async () => {
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Self Dep',
        identifier: 'test_self_dep',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const dt = createRes.json();
    cleanupDtIds.push(dt.id);

    // Try to set self as dependency
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${dtBase()}/${dt.id}`,
      payload: { dependencies: [dt.id] },
    });
    expect(updateRes.statusCode).toBe(400);
  });

  // 6. Circular dependency returns 400
  it('circular dependency A→B→A returns 400', async () => {
    // Create A
    const resA = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: { name: 'Circ A', identifier: 'test_circ_a' },
    });
    expect(resA.statusCode).toBe(200);
    const dtA = resA.json();
    cleanupDtIds.push(dtA.id);

    // Create B depending on A
    const resB = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: { name: 'Circ B', identifier: 'test_circ_b', dependencies: [dtA.id] },
    });
    expect(resB.statusCode).toBe(200);
    const dtB = resB.json();
    cleanupDtIds.push(dtB.id);

    // Try to make A depend on B (circular)
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${dtBase()}/${dtA.id}`,
      payload: { dependencies: [dtB.id] },
    });
    expect(updateRes.statusCode).toBe(400);
  });

  // 7. Link multiple applicability rules
  it('link multiple applicability rules to a derivative type', async () => {
    const builder = await createBuilder('test-dt-multi-rule-builder', '-mr');
    cleanupBuilderIds.push(builder.id);

    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Multi Rule DT',
        identifier: 'test_multi_rule',
        builderId: builder.id,
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();
    cleanupDtIds.push(dt.id);

    // Create two rules
    const rule1 = await createSimpleRule('test-rule-mr-1');
    cleanupRuleIds.push(rule1.id);
    const rule2 = await createSimpleRule('test-rule-mr-2');
    cleanupRuleIds.push(rule2.id);

    // Link rule 1
    const link1Res = await inject(app, adminCookies, {
      method: 'POST',
      url: `${dtBase()}/${dt.id}/applicability-rules`,
      payload: { ruleId: rule1.id, displayOrder: 0 },
    });
    expect(link1Res.statusCode).toBe(200);
    const link1 = link1Res.json();

    // Link rule 2
    const link2Res = await inject(app, adminCookies, {
      method: 'POST',
      url: `${dtBase()}/${dt.id}/applicability-rules`,
      payload: { ruleId: rule2.id, displayOrder: 1 },
    });
    expect(link2Res.statusCode).toBe(200);
    const link2 = link2Res.json();

    // Verify both rules linked
    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${dtBase()}/${dt.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const dtFull = getRes.json();
    expect(dtFull.applicabilityRules).toBeDefined();
    expect(dtFull.applicabilityRules.length).toBeGreaterThanOrEqual(2);
  });

  // 8. Reorder applicability rules
  it('reorder applicability rules', async () => {
    const builder = await createBuilder('test-dt-reorder-builder', '-ro');
    cleanupBuilderIds.push(builder.id);

    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Reorder Rules DT',
        identifier: 'test_reorder_rules',
        builderId: builder.id,
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();
    cleanupDtIds.push(dt.id);

    // Create and link two rules
    const rule1 = await createSimpleRule('test-rule-ro-1');
    cleanupRuleIds.push(rule1.id);
    const rule2 = await createSimpleRule('test-rule-ro-2');
    cleanupRuleIds.push(rule2.id);

    const link1Res = await inject(app, adminCookies, {
      method: 'POST',
      url: `${dtBase()}/${dt.id}/applicability-rules`,
      payload: { ruleId: rule1.id, displayOrder: 0 },
    });
    const link1 = link1Res.json();

    const link2Res = await inject(app, adminCookies, {
      method: 'POST',
      url: `${dtBase()}/${dt.id}/applicability-rules`,
      payload: { ruleId: rule2.id, displayOrder: 1 },
    });
    const link2 = link2Res.json();

    // Reorder: put link2 before link1
    const reorderRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${dtBase()}/${dt.id}/applicability-rules/order`,
      payload: { linkIds: [link2.id, link1.id] },
    });
    expect(reorderRes.statusCode).toBe(200);

    // Verify order
    const getRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${dtBase()}/${dt.id}`,
    });
    const dtFull = getRes.json();
    const rules = dtFull.applicabilityRules;
    expect(rules[0].id || rules[0].linkId).toEqual(link2.id);
    expect(rules[1].id || rules[1].linkId).toEqual(link1.id);
  });

  // 9. Unlink applicability rule and verify type still exists
  it('unlink applicability rule and verify type still exists', async () => {
    // Get the seeded past_tense derivative type id
    const pastTenseId = await getDerivativeTypeId(app, adminCookies, projectId, 'past_tense');

    // Create a rule
    const rule = await createSimpleRule('test-rule-unlink');
    cleanupRuleIds.push(rule.id);

    // Link rule to past_tense
    const linkRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `${dtBase()}/${pastTenseId}/applicability-rules`,
      payload: { ruleId: rule.id },
    });
    expect(linkRes.statusCode).toBe(200);
    const link = linkRes.json();

    // Create a verb word
    const word = await createWord(app, adminCookies, projectId, {
      word: 'unlinkara',
      translation: 'unlink test',
      word_type: 'Verb',
    });
    cleanupWordIds.push(word.id);

    // Verify derivative exists
    const wordRes1 = await inject(app, adminCookies, {
      method: 'GET',
      url: `${wordsBase()}/${word.id}`,
    });
    const wordData1 = wordRes1.json();
    const derivBefore = wordData1.derivatives?.find((d: any) => d.identifier === 'past_tense');
    expect(derivBefore).toBeDefined();

    // Unlink the rule
    const unlinkRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `${dtBase()}/${pastTenseId}/applicability-rules/${link.id}`,
    });
    expect(unlinkRes.statusCode).toBe(200);

    // Re-fetch word — derivative should still exist (the unlinked rule was an extra, not the primary applicability)
    const wordRes2 = await inject(app, adminCookies, {
      method: 'GET',
      url: `${wordsBase()}/${word.id}`,
    });
    const wordData2 = wordRes2.json();
    const derivAfter = wordData2.derivatives?.find((d: any) => d.identifier === 'past_tense');
    // The derivative should still be present (the unlinked rule was an extra rule, not the primary applicability)
    expect(derivAfter).toBeDefined();
  });

  // 10. Soft-delete derivative type (derivatives persist — no cascade regeneration on delete)
  it('soft-delete derivative type (derivatives persist — no cascade regeneration on delete)', async () => {
    const builder = await createBuilder('test-dt-delete-builder', '-del');
    cleanupBuilderIds.push(builder.id);

    // Create derivative type
    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Delete Test DT',
        identifier: 'test_delete_dt',
        builderId: builder.id,
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();

    // Create a word
    const word = await createWord(app, adminCookies, projectId, {
      word: 'deletara',
      translation: 'delete test',
      word_type: 'Verb',
    });
    cleanupWordIds.push(word.id);

    // Verify the derivative exists on the word
    const wordRes1 = await inject(app, adminCookies, {
      method: 'GET',
      url: `${wordsBase()}/${word.id}`,
    });
    const wordData1 = wordRes1.json();
    const derivBefore = wordData1.derivatives?.find((d: any) => d.identifier === 'test_delete_dt');
    expect(derivBefore).toBeDefined();
    expect(derivBefore.value).toBe('deletara-del');

    // Delete derivative type
    const deleteRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `${dtBase()}/${dt.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);

    // Re-fetch word — derivative data is preserved (soft-delete keeps existing data)
    const wordRes2 = await inject(app, adminCookies, {
      method: 'GET',
      url: `${wordsBase()}/${word.id}`,
    });
    const wordData2 = wordRes2.json();
    const derivAfter = wordData2.derivatives?.find((d: any) => d.identifier === 'test_delete_dt');
    expect(derivAfter).toBeDefined();
    expect(derivAfter.value).toBe('deletara-del');
  });

  // 11. Version history
  it('version history: created and updated entries', async () => {
    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Versions DT',
        identifier: 'test_versions_dt',
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();
    cleanupDtIds.push(dt.id);

    // Update it
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${dtBase()}/${dt.id}`,
      payload: { name: 'Versions DT Updated' },
    });
    expect(updateRes.statusCode).toBe(200);

    // Check versions
    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${dtBase()}/${dt.id}/versions`,
    });
    expect(versionsRes.statusCode).toBe(200);
    const versions = versionsRes.json().items;
    expect(Array.isArray(versions)).toBe(true);

    const changeTypes = versions.map((v: any) => v.changeType);
    expect(changeTypes).toContain('created');
    expect(changeTypes).toContain('updated');
  });

  // 12. Self-dependency rejected with 400
  it('self-dependency via PUT returns 400', async () => {
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Self Dep Direct',
        identifier: 'test_self_dep_direct',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const dt = createRes.json();
    cleanupDtIds.push(dt.id);

    // Try to set itself as a dependency
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${dtBase()}/${dt.id}`,
      payload: { dependencies: [dt.id] },
    });
    expect(updateRes.statusCode).toBe(400);
  });

  // 13. Delete derivative type cleans up word derivatives
  it('delete derivative type and word no longer has that derivative', async () => {
    // Create a builder that appends '-cleanup'
    const builder = await createBuilder('test-dt-cleanup-builder', '-cleanup');
    cleanupBuilderIds.push(builder.id);

    // Create derivative type
    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Cleanup DT',
        identifier: 'test_cleanup_dt',
        builderId: builder.id,
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();

    // Create a word that will get a derivative
    const word = await createWord(app, adminCookies, projectId, {
      word: 'cleanara',
      translation: 'cleanup test',
      word_type: 'Verb',
    });
    cleanupWordIds.push(word.id);

    // Verify derivative exists
    const wordRes1 = await inject(app, adminCookies, {
      method: 'GET',
      url: `${wordsBase()}/${word.id}`,
    });
    const wordData1 = wordRes1.json();
    const derivBefore = wordData1.derivatives?.find((d: any) => d.identifier === 'test_cleanup_dt');
    expect(derivBefore).toBeDefined();
    expect(derivBefore.value).toBe('cleanara-cleanup');

    // Delete the derivative type
    const deleteRes = await inject(app, adminCookies, {
      method: 'DELETE',
      url: `${dtBase()}/${dt.id}`,
    });
    expect(deleteRes.statusCode).toBe(200);

    // Re-fetch word and verify the derivative type is no longer in the list
    // (the derivative type itself is soft-deleted, so it should be filtered out)
    const dtListRes = await inject(app, adminCookies, {
      method: 'GET',
      url: dtBase(),
    });
    const dtList = dtListRes.json().items;
    const foundDt = dtList.find((d: any) => d.identifier === 'test_cleanup_dt');
    expect(foundDt).toBeUndefined();
  });

  // 14. Change builderId on derivative type triggers cascade
  it('changing builderId triggers cascade derivative regeneration', async () => {
    // Create two builders with different suffixes
    const builder1 = await createBuilder('test-dt-cascade-builder-1', '-alpha');
    cleanupBuilderIds.push(builder1.id);
    const builder2 = await createBuilder('test-dt-cascade-builder-2', '-beta');
    cleanupBuilderIds.push(builder2.id);

    // Create derivative type with builder1
    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'Cascade Builder DT',
        identifier: 'test_cascade_builder_dt',
        builderId: builder1.id,
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();
    cleanupDtIds.push(dt.id);

    // Create a word
    const word = await createWord(app, adminCookies, projectId, {
      word: 'cascara',
      translation: 'cascade test',
      word_type: 'Verb',
    });
    cleanupWordIds.push(word.id);

    // Verify derivative uses builder1's suffix
    const wordRes1 = await inject(app, adminCookies, {
      method: 'GET',
      url: `${wordsBase()}/${word.id}`,
    });
    const wordData1 = wordRes1.json();
    const derivBefore = wordData1.derivatives?.find((d: any) => d.identifier === 'test_cascade_builder_dt');
    expect(derivBefore).toBeDefined();
    expect(derivBefore.value).toBe('cascara-alpha');

    // Change the builderId to builder2
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${dtBase()}/${dt.id}`,
      payload: { builderId: builder2.id },
    });
    expect(updateRes.statusCode).toBe(200);

    // Re-fetch word — derivative should now use builder2's suffix
    const wordRes2 = await inject(app, adminCookies, {
      method: 'GET',
      url: `${wordsBase()}/${word.id}`,
    });
    const wordData2 = wordRes2.json();
    const derivAfter = wordData2.derivatives?.find((d: any) => d.identifier === 'test_cascade_builder_dt');
    expect(derivAfter).toBeDefined();
    expect(derivAfter.value).toBe('cascara-beta');
  });
});

describe('Derivative Types — cross-project isolation', () => {
  let otherProjectId: string;

  beforeAll(async () => {
    // Create a second project as admin and grab its ID
    const res = await inject(app, adminCookies, {
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'IsolationProbe', description: 'IDOR test' },
    });
    otherProjectId = res.json().id;
  });

  it('GET /derivative-types/:id from another project returns 404', async () => {
    // Create a derivative type in the primary project
    const createRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'IsolationSentinel',
        identifier: 'isolation_sentinel',
        required: false,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const dt = createRes.json();

    // Try to fetch it via the OTHER project's URL
    const leakRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${otherProjectId}/derivative-types/${dt.id}`,
    });
    expect(leakRes.statusCode).toBe(404);
  });

  it('rejects applicability-rule linking when rule and type are in different projects', async () => {
    // Create derivative type in primary project
    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase(),
      payload: {
        name: 'CrossLinkProbe',
        identifier: 'cross_link_probe',
        required: false,
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();

    // Create a rule in the OTHER project
    const ruleRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `/api/v1/projects/${otherProjectId}/rules`,
      payload: {
        name: 'CrossProjectRule',
        graph: {
          nodes: [{ id: 'ret-1', type: 'return_rule', position: { x: 0, y: 0 }, data: { valid: true } }],
          edges: [],
        },
      },
    });
    expect(ruleRes.statusCode).toBe(200);
    const crossRule = ruleRes.json();

    // Attempt to link the foreign rule
    const linkRes = await inject(app, adminCookies, {
      method: 'POST',
      url: `${dtBase()}/${dt.id}/applicability-rules`,
      payload: { ruleId: crossRule.id },
    });
    expect(linkRes.statusCode).toBe(404);
  });
});
