import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('@fastify/rate-limit', () => ({
  default: async () => {},
  __esModule: true,
}));

import {
  setupTestApp, teardownTestApp, inject,
  getAttributeId, getVariableId, getRuleId,
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

function pos(x: number, y: number) {
  return { x, y };
}

function makeReturnRule(id: string, message = 'Rule result') {
  return {
    id,
    type: 'return_rule',
    position: pos(600, 200),
    data: { message },
  };
}

function edge(id: string, source: string, sourceHandle: string, target: string, targetHandle: string) {
  return { id, source, sourceHandle, target, targetHandle };
}

async function createRule(name: string, graph: any) {
  const res = await inject(app, adminCookies, {
    method: 'POST',
    url: `/api/v1/projects/${projectId}/rules`,
    payload: { name, graph },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function testRule(ruleId: string, attributeValues: Record<string, unknown>) {
  const res = await inject(app, adminCookies, {
    method: 'POST',
    url: `/api/v1/projects/${projectId}/rules/${ruleId}/test`,
    payload: { attributeValues },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function deleteRule(ruleId: string) {
  await inject(app, adminCookies, {
    method: 'DELETE',
    url: `/api/v1/projects/${projectId}/rules/${ruleId}`,
  });
}

describe('Rules — Extended', () => {


  describe('Graph structure', () => {
    it('1. creates rule with empty graph (no nodes, no edges)', async () => {
      const rule = await createRule('test-rule-empty-graph', { nodes: [], edges: [] });
      expect(rule.id).toBeDefined();
      await deleteRule(rule.id);
    });

    it('2. returns 400 when graph is null', async () => {
      const res = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/rules`,
        payload: { name: 'test-rule-null-graph', graph: null },
      });
      expect(res.statusCode).toBe(400);
    });

    it('3. testing rule with no return_rule node — pass derived from last output', async () => {
      const rule = await createRule('test-rule-no-return-node', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
        ],
        edges: [],
      });

      // attribute_input outputs "hello" which is truthy => pass: true
      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      // Empty string is falsy => pass: false
      const result2 = await testRule(rule.id, { word: '' });
      expect(result2.pass).toBe(false);

      await deleteRule(rule.id);
    });

    it('4. testing rule with disconnected nodes — return_rule gets no input', async () => {
      const rule = await createRule('test-rule-disconnected', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(200, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [], // No edges — all disconnected
      });

      // return_rule with no pass input defaults to true (node.data.pass ?? true)
      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });
  });

  describe('Condition nodes', () => {

    it('5. contains_one_of — word containing "ell" passes', async () => {
      const rule = await createRule('test-rule-contains-one-of', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'lit1', type: 'literal_value', position: pos(0, 200), data: { value: ['ell', 'xyz'] } },
          { id: 'c1', type: 'contains_one_of', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'lit1', 'output', 'c1', 'items'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('6. starts_with_one_of — word starting with "th" passes', async () => {
      const rule = await createRule('test-rule-starts-with-one-of', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'lit1', type: 'literal_value', position: pos(0, 200), data: { value: ['th', 'sh'] } },
          { id: 'c1', type: 'starts_with_one_of', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'lit1', 'output', 'c1', 'items'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'thalien' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('7. ends_with_one_of — word ending with "en" passes', async () => {
      const rule = await createRule('test-rule-ends-with-one-of', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'lit1', type: 'literal_value', position: pos(0, 200), data: { value: ['en', 'ar'] } },
          { id: 'c1', type: 'ends_with_one_of', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'lit1', 'output', 'c1', 'items'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'thalien' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('8. equals — attribute_input equals literal_value passes', async () => {
      const rule = await createRule('test-rule-equals', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'lit1', type: 'literal_value', position: pos(0, 200), data: { value: 'velara' } },
          { id: 'c1', type: 'equals', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'a'),
          edge('e2', 'lit1', 'output', 'c1', 'b'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'velara' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('9. not_equals — different values passes', async () => {
      const rule = await createRule('test-rule-not-equals', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'lit1', type: 'literal_value', position: pos(0, 200), data: { value: 'different' } },
          { id: 'c1', type: 'not_equals', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'a'),
          edge('e2', 'lit1', 'output', 'c1', 'b'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('10. is_empty — empty string passes, non-empty fails', async () => {
      const rule = await createRule('test-rule-is-empty', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // attribute_input for empty word returns null (context.attributeValues['word'] ?? null)
      // is_empty(null) => true => pass: true
      const passResult = await testRule(rule.id, {});
      expect(passResult.pass).toBe(true);

      // Non-empty string => is_empty => false => pass: false
      const failResult = await testRule(rule.id, { word: 'hello' });
      expect(failResult.pass).toBe(false);

      await deleteRule(rule.id);
    });

    it('11. is_one_of — value in list passes, value not in list fails', async () => {
      const rule = await createRule('test-rule-is-one-of', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'lit1', type: 'literal_value', position: pos(0, 200), data: { value: ['velara', 'thalien', 'mirael'] } },
          { id: 'c1', type: 'is_one_of', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'lit1', 'output', 'c1', 'items'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const passResult = await testRule(rule.id, { word: 'velara' });
      expect(passResult.pass).toBe(true);

      const failResult = await testRule(rule.id, { word: 'unknown' });
      expect(failResult.pass).toBe(false);

      await deleteRule(rule.id);
    });

    it('12. length_compare equals — word length = 6 passes', async () => {
      const rule = await createRule('test-rule-length-equals', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'equals', value: 6 } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // "velara" has 6 chars
      const result = await testRule(rule.id, { word: 'velara' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('13. length_compare greater_than — word length > 3 passes', async () => {
      const rule = await createRule('test-rule-length-gt', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'greater_than', value: 3 } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('14. length_compare less_than — word length < 10 passes', async () => {
      const rule = await createRule('test-rule-length-lt', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'less_than', value: 10 } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('15. length_compare greater_or_equal — word length >= 5 passes for 5-char word', async () => {
      const rule = await createRule('test-rule-length-gte', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'greater_or_equal', value: 5 } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('16. length_compare less_or_equal — word length <= 5 passes for 5-char word', async () => {
      const rule = await createRule('test-rule-length-lte', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'less_or_equal', value: 5 } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('17. length_compare not_equals — word length != 3 passes for 5-char word', async () => {
      const rule = await createRule('test-rule-length-neq', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'not_equals', value: 3 } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('18. matches_pattern — ^[a-z]+$ passes for lowercase word', async () => {
      const rule = await createRule('test-rule-matches-pattern', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'matches_pattern', position: pos(300, 0), data: { pattern: '^[a-z]+$' } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      const result = await testRule(rule.id, { word: 'velara' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('19. matches_pattern — case insensitive flag', async () => {
      const rule = await createRule('test-rule-matches-pattern-ci', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'matches_pattern', position: pos(300, 0), data: { pattern: '^[a-z]+$', flags: 'i' } },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Uppercase word should pass with case-insensitive flag
      const result = await testRule(rule.id, { word: 'Velara' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('20. attribute_equals — two attributes equal passes', async () => {
      // attribute_equals reads from inputs.a and inputs.b, so we need
      // two attribute_input nodes wired to its a and b handles.
      const rule = await createRule('test-rule-attribute-equals', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'a2', type: 'attribute_input', position: pos(0, 200), data: { attributeIdentifier: 'translation' } },
          { id: 'c1', type: 'attribute_equals', position: pos(300, 100), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'a'),
          edge('e2', 'a2', 'output', 'c1', 'b'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Same value for both => pass
      const passResult = await testRule(rule.id, { word: 'same', translation: 'same' });
      expect(passResult.pass).toBe(true);

      // Different values => fail
      const failResult = await testRule(rule.id, { word: 'abc', translation: 'xyz' });
      expect(failResult.pass).toBe(false);

      await deleteRule(rule.id);
    });
  });

  describe('Logic nodes', () => {

    it('21. AND — both conditions true passes', async () => {
      const rule = await createRule('test-rule-and-both-true', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'greater_than', value: 3 } },
          { id: 'c2', type: 'length_compare', position: pos(300, 200), data: { operator: 'less_than', value: 10 } },
          { id: 'and1', type: 'and', position: pos(500, 100), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'a1', 'output', 'c2', 'input'),
          edge('e3', 'c1', 'output', 'and1', 'a'),
          edge('e4', 'c2', 'output', 'and1', 'b'),
          edge('e5', 'and1', 'output', 'r1', 'pass'),
        ],
      });

      // "hello" length 5: >3 true AND <10 true => true
      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('22. AND — one condition false fails', async () => {
      const rule = await createRule('test-rule-and-one-false', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'greater_than', value: 3 } },
          { id: 'c2', type: 'length_compare', position: pos(300, 200), data: { operator: 'less_than', value: 4 } },
          { id: 'and1', type: 'and', position: pos(500, 100), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'a1', 'output', 'c2', 'input'),
          edge('e3', 'c1', 'output', 'and1', 'a'),
          edge('e4', 'c2', 'output', 'and1', 'b'),
          edge('e5', 'and1', 'output', 'r1', 'pass'),
        ],
      });

      // "hello" length 5: >3 true, <4 false => false
      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(false);

      await deleteRule(rule.id);
    });

    it('23. OR — one condition true passes', async () => {
      const rule = await createRule('test-rule-or-one-true', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'equals', value: 99 } },
          { id: 'c2', type: 'length_compare', position: pos(300, 200), data: { operator: 'equals', value: 5 } },
          { id: 'or1', type: 'or', position: pos(500, 100), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'a1', 'output', 'c2', 'input'),
          edge('e3', 'c1', 'output', 'or1', 'a'),
          edge('e4', 'c2', 'output', 'or1', 'b'),
          edge('e5', 'or1', 'output', 'r1', 'pass'),
        ],
      });

      // "hello" length 5: =99 false, =5 true => true
      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });

    it('24. OR — both conditions false fails', async () => {
      const rule = await createRule('test-rule-or-both-false', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'equals', value: 99 } },
          { id: 'c2', type: 'length_compare', position: pos(300, 200), data: { operator: 'equals', value: 100 } },
          { id: 'or1', type: 'or', position: pos(500, 100), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'a1', 'output', 'c2', 'input'),
          edge('e3', 'c1', 'output', 'or1', 'a'),
          edge('e4', 'c2', 'output', 'or1', 'b'),
          edge('e5', 'or1', 'output', 'r1', 'pass'),
        ],
      });

      // "hello" length 5: =99 false, =100 false => false
      const result = await testRule(rule.id, { word: 'hello' });
      expect(result.pass).toBe(false);

      await deleteRule(rule.id);
    });

    it('25. NOT — invert is_empty to check "is not empty"', async () => {
      const rule = await createRule('test-rule-not-is-empty', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          { id: 'n1', type: 'not', position: pos(500, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'n1', 'input'),
          edge('e3', 'n1', 'output', 'r1', 'pass'),
        ],
      });

      // Non-empty: is_empty=false => NOT => true => pass
      const passResult = await testRule(rule.id, { word: 'hello' });
      expect(passResult.pass).toBe(true);

      // Empty/missing: is_empty=true => NOT => false => fail
      const failResult = await testRule(rule.id, {});
      expect(failResult.pass).toBe(false);

      await deleteRule(rule.id);
    });
  });

  describe('if_branch', () => {
    it('26. returns different messages on true/false paths', async () => {
      const rule = await createRule('test-rule-if-branch', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          { id: 'if1', type: 'if_branch', position: pos(500, 0), data: {} },
          {
            id: 'r_true',
            type: 'return_rule',
            position: pos(700, 0),
            data: { message: 'Word is empty' },
          },
          {
            id: 'r_false',
            type: 'return_rule',
            position: pos(700, 200),
            data: { message: 'Word is not empty' },
          },
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'if1', 'condition'),
          // true branch: is_empty=true => pass input comes from the if_branch true handle
          edge('e3', 'if1', 'true', 'r_true', 'pass'),
          // false branch: is_empty=false => pass input comes from the if_branch false handle
          edge('e4', 'if1', 'false', 'r_false', 'pass'),
        ],
      });

      // Empty word => true branch; if_branch outputs (inputs.value ?? true) on true path
      const emptyResult = await testRule(rule.id, {});
      expect(emptyResult.pass).toBe(true);
      expect(emptyResult.message).toContain('empty');

      // Non-empty word => false branch; if_branch outputs (inputs.value ?? false) on false path
      const nonEmptyResult = await testRule(rule.id, { word: 'hello' });
      // false path returns (value ?? false), and return_rule gets Boolean(false) => pass: false
      expect(nonEmptyResult.message).toContain('not empty');

      await deleteRule(rule.id);
    });
  });

  describe('Variable reference', () => {
    it('27. uses seeded Vowels variable in contains_one_of', async () => {
      // variable_reference uses variableName, not variableId
      const rule = await createRule('test-rule-variable-ref', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'v1', type: 'variable_reference', position: pos(0, 200), data: { variableName: 'Vowels' } },
          { id: 'c1', type: 'contains_one_of', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'v1', 'output', 'c1', 'items'),
          edge('e3', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // "velara" contains vowels => pass
      const result = await testRule(rule.id, { word: 'velara' });
      expect(result.pass).toBe(true);

      await deleteRule(rule.id);
    });
  });

  describe('Enable/disable', () => {
    it('28. disabled rule does not block word validation', async () => {
      // Create a rule that rejects everything (length must equal 0)
      const rule = await createRule('test-rule-enable-disable', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'equals', value: 0 } },
          makeReturnRule('r1', 'Length check result'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Link as required word rule
      const linkRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/word-rules`,
        payload: { ruleId: rule.id, required: true },
      });
      expect(linkRes.statusCode).toBe(200);
      const link = linkRes.json();

      // Validate word — should fail because any non-empty word has length != 0
      const failValidation = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/validate`,
        payload: { attributeValues: { word: 'testword', translation: 'test', word_type: 'Noun' } },
      });
      const failBody = failValidation.json();
      expect(failBody.valid).toBe(false);

      // Disable the rule
      await inject(app, adminCookies, {
        method: 'PUT',
        url: `/api/v1/projects/${projectId}/rules/${rule.id}`,
        payload: { enabled: false },
      });

      // Validate same word again — should now pass (disabled rule skipped)
      const passValidation = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/validate`,
        payload: { attributeValues: { word: 'testword', translation: 'test', word_type: 'Noun' } },
      });
      const passBody = passValidation.json();
      expect(passBody.valid).toBe(true);

      // Clean up: remove link and delete rule
      await inject(app, adminCookies, {
        method: 'DELETE',
        url: `/api/v1/projects/${projectId}/word-rules/${link.id}`,
      });
      await deleteRule(rule.id);
    });
  });

  describe('Deletion of linked rules', () => {
    it('29. deleting a rule removes it from word-rules list', async () => {
      const rule = await createRule('test-rule-delete-word-rule', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Link as word rule
      const linkRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/word-rules`,
        payload: { ruleId: rule.id, required: true },
      });
      expect(linkRes.statusCode).toBe(200);

      // Delete the rule (soft delete)
      await deleteRule(rule.id);

      // The rules list endpoint (which drives the word-rules view) should not
      // include the deleted rule. Verify via the rules list with usage info.
      const rulesRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/rules`,
      });
      const allRules = rulesRes.json().items;
      const found = allRules.some((r: any) => r.id === rule.id);
      expect(found).toBe(false);
    });

    it('30. deleting a rule removes it from derivative type applicability rules', async () => {
      const rule = await createRule('test-rule-delete-dt-rule', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Get derivative types
      const dtRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/derivative-types`,
      });
      const derivativeTypes = dtRes.json().items;
      expect(derivativeTypes.length).toBeGreaterThan(0);
      const dtId = derivativeTypes[0].id;

      // Link rule as applicability rule
      const linkRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/derivative-types/${dtId}/applicability-rules`,
        payload: { ruleId: rule.id, required: true },
      });
      expect(linkRes.statusCode).toBe(200);

      // Delete the rule (soft delete)
      await deleteRule(rule.id);

      // Verify the rule no longer appears in the rules list
      const rulesRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/rules`,
      });
      const allRules = rulesRes.json().items;
      const found = allRules.some((r: any) => r.id === rule.id);
      expect(found).toBe(false);
    });
  });

  describe('Version history', () => {
    it('31. create + update rule shows created and updated versions', async () => {
      const rule = await createRule('test-rule-versioning', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Update rule
      await inject(app, adminCookies, {
        method: 'PUT',
        url: `/api/v1/projects/${projectId}/rules/${rule.id}`,
        payload: { name: 'test-rule-versioning-updated', description: 'Updated description' },
      });

      // Fetch versions
      const versionsRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/rules/${rule.id}/versions`,
      });
      expect(versionsRes.statusCode).toBe(200);
      const versions = versionsRes.json().items;
      expect(Array.isArray(versions)).toBe(true);
      expect(versions.length).toBeGreaterThanOrEqual(2);

      const changeTypes = versions.map((v: any) => v.changeType);
      expect(changeTypes).toContain('created');
      expect(changeTypes).toContain('updated');

      await deleteRule(rule.id);
    });
  });

  describe('Cascade cleanup', () => {
    it('32. soft-deleted rule is hidden from word_rule_links via JOIN filter (not FK cascade)', async () => {
      // Create a rule
      const rule = await createRule('test-rule-cascade-wr', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Link as word rule
      const linkRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/word-rules`,
        payload: { ruleId: rule.id, required: true },
      });
      expect(linkRes.statusCode).toBe(200);

      // Verify it appears in word-rules list
      const beforeRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/word-rules`,
      });
      expect(beforeRes.statusCode).toBe(200);
      const wordRulesBefore = beforeRes.json().items || beforeRes.json();
      const foundBefore = wordRulesBefore.some((wr: any) => wr.ruleId === rule.id || wr.rule?.id === rule.id);
      expect(foundBefore).toBe(true);

      // Delete the rule
      await deleteRule(rule.id);

      // Verify GET /word-rules no longer lists it
      const afterRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/word-rules`,
      });
      expect(afterRes.statusCode).toBe(200);
      const wordRulesAfter = afterRes.json().items || afterRes.json();
      const foundAfter = wordRulesAfter.some((wr: any) => wr.ruleId === rule.id || wr.rule?.id === rule.id);
      expect(foundAfter).toBe(false);
    });

    it('33. soft-deleted rule is hidden from derivative_type_rule_links via JOIN filter (not FK cascade)', async () => {
      // Create a rule
      const rule = await createRule('test-rule-cascade-dt', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'is_empty', position: pos(300, 0), data: {} },
          makeReturnRule('r1'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Get the first derivative type
      const dtRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/derivative-types`,
      });
      const derivativeTypes = dtRes.json().items;
      expect(derivativeTypes.length).toBeGreaterThan(0);
      const dtId = derivativeTypes[0].id;

      // Link rule as applicability rule
      const linkRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/derivative-types/${dtId}/applicability-rules`,
        payload: { ruleId: rule.id },
      });
      expect(linkRes.statusCode).toBe(200);

      // Verify the rule appears in the derivative type's applicability rules
      const dtBeforeRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/derivative-types/${dtId}`,
      });
      const dtBefore = dtBeforeRes.json();
      const foundBefore = dtBefore.applicabilityRules?.some(
        (ar: any) => ar.ruleId === rule.id || ar.rule?.id === rule.id
      );
      expect(foundBefore).toBe(true);

      // Delete the rule
      await deleteRule(rule.id);

      // Verify the derivative type's applicability rules no longer include it
      const dtAfterRes = await inject(app, adminCookies, {
        method: 'GET',
        url: `/api/v1/projects/${projectId}/derivative-types/${dtId}`,
      });
      const dtAfter = dtAfterRes.json();
      const foundAfter = dtAfter.applicabilityRules?.some(
        (ar: any) => ar.ruleId === rule.id || ar.rule?.id === rule.id
      );
      expect(foundAfter).toBe(false);
    });

    it('34. disabled rule — word validation skips it and passes', async () => {
      // Create a rule that always fails (word length must equal 999)
      const rule = await createRule('test-rule-disable-skip', {
        nodes: [
          { id: 'a1', type: 'attribute_input', position: pos(0, 0), data: { attributeIdentifier: 'word' } },
          { id: 'c1', type: 'length_compare', position: pos(300, 0), data: { operator: 'equals', value: 999 } },
          makeReturnRule('r1', 'Must be 999 chars'),
        ],
        edges: [
          edge('e1', 'a1', 'output', 'c1', 'input'),
          edge('e2', 'c1', 'output', 'r1', 'pass'),
        ],
      });

      // Link as required word rule
      const linkRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/word-rules`,
        payload: { ruleId: rule.id, required: true },
      });
      expect(linkRes.statusCode).toBe(200);
      const link = linkRes.json();

      // Validate a normal word — should FAIL because rule requires 999 chars
      const failRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/validate`,
        payload: { attributeValues: { word: 'shortword', translation: 'test', word_type: 'Noun' } },
      });
      expect(failRes.json().valid).toBe(false);

      // Disable the rule
      const disableRes = await inject(app, adminCookies, {
        method: 'PUT',
        url: `/api/v1/projects/${projectId}/rules/${rule.id}`,
        payload: { enabled: false },
      });
      expect(disableRes.statusCode).toBe(200);

      // Validate same word again — should PASS because disabled rule is skipped
      const passRes = await inject(app, adminCookies, {
        method: 'POST',
        url: `/api/v1/projects/${projectId}/words/validate`,
        payload: { attributeValues: { word: 'shortword', translation: 'test', word_type: 'Noun' } },
      });
      expect(passRes.json().valid).toBe(true);

      // Cleanup
      await inject(app, adminCookies, {
        method: 'DELETE',
        url: `/api/v1/projects/${projectId}/word-rules/${link.id}`,
      });
      await deleteRule(rule.id);
    });
  });
});
