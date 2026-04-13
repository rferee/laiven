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

const base = () => `/api/v1/projects/${projectId}/builders`;

function simpleGraph(
  transformId: string,
  transformType: string,
  transformData: Record<string, unknown>,
  extra?: {
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
    inputHandle?: string;
    outputHandle?: string;
  },
) {
  const inputNode = {
    id: 'input-1',
    type: 'attribute_input',
    position: { x: 0, y: 0 },
    data: { attributeIdentifier: 'word' },
  };

  const transformNode = {
    id: transformId,
    type: transformType,
    position: { x: 200, y: 0 },
    data: transformData,
  };

  const returnNode = {
    id: 'return-1',
    type: 'return_builder',
    position: { x: 400, y: 0 },
    data: {},
  };

  const nodes = [inputNode, transformNode, returnNode, ...(extra?.nodes ?? [])];

  const edges = [
    {
      id: 'e-input-transform',
      source: 'input-1',
      sourceHandle: 'output',
      target: transformId,
      targetHandle: extra?.inputHandle ?? 'input',
    },
    {
      id: 'e-transform-return',
      source: transformId,
      sourceHandle: extra?.outputHandle ?? 'output',
      target: 'return-1',
      targetHandle: 'value',
    },
    ...(extra?.edges ?? []),
  ];

  return { nodes, edges };
}

async function createBuilder(name: string, graph: unknown) {
  const res = await inject(app, adminCookies, {
    method: 'POST',
    url: base(),
    payload: { name, graph },
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { id: string; name: string };
}

async function testBuilder(
  builderId: string,
  attributeValues: Record<string, unknown>,
  derivativeValues?: Record<string, unknown>,
) {
  const payload: Record<string, unknown> = { attributeValues };
  if (derivativeValues) payload.derivativeValues = derivativeValues;
  const res = await inject(app, adminCookies, {
    method: 'POST',
    url: `${base()}/${builderId}/test`,
    payload,
  });
  return res;
}

async function deleteBuilder(id: string) {
  await inject(app, adminCookies, { method: 'DELETE', url: `${base()}/${id}` });
}

describe('Builders — Extended', () => {
  const cleanupIds: string[] = [];

  afterAll(async () => {
    for (const id of cleanupIds) {
      await deleteBuilder(id);
    }
  });

  // 1. append
  it('append node: walk → walked', async () => {
    const graph = simpleGraph('t1', 'append', { suffix: 'ed' });
    const builder = await createBuilder('test-builder-append', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'walk' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.value).toBe('walked');
  });

  // 2. prepend
  it('prepend node: walk → unwalk', async () => {
    const graph = simpleGraph('t2', 'prepend', { prefix: 'un' });
    const builder = await createBuilder('test-builder-prepend', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'walk' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('unwalk');
  });

  // 3. remove_last_n
  it('remove_last_n(2): hello → hel', async () => {
    const graph = simpleGraph('t3', 'remove_last_n', { n: 2 });
    const builder = await createBuilder('test-builder-remove-last', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('hel');
  });

  // 4. remove_first_n
  it('remove_first_n(2): hello → llo', async () => {
    const graph = simpleGraph('t4', 'remove_first_n', { n: 2 });
    const builder = await createBuilder('test-builder-remove-first', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('llo');
  });

  // 5. replace
  it('replace: banana (a→o) → bonono', async () => {
    const graph = simpleGraph('t5', 'replace', { search: 'a', replaceWith: 'o' });
    const builder = await createBuilder('test-builder-replace', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'banana' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('bonono');
  });

  // 6. replace_pattern with flags
  it('replace_pattern: remove vowels with regex', async () => {
    const graph = simpleGraph('t6', 'replace_pattern', {
      pattern: '[aeiou]',
      replaceWith: '',
      flags: 'g',
    });
    const builder = await createBuilder('test-builder-replace-pattern', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'banana' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('bnn');
  });

  // 7. replace_pattern with invalid regex — graceful handling
  it('replace_pattern: invalid regex handled gracefully', async () => {
    const graph = simpleGraph('t7', 'replace_pattern', {
      pattern: '[invalid',
      replaceWith: '',
      flags: 'g',
    });
    const builder = await createBuilder('test-builder-bad-regex', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    // Executor catches invalid regex and returns original input
    expect(res.statusCode).toBe(200);
  });

  // 8. substring(0, 3)
  it('substring(0,3): hello → hel', async () => {
    const graph = simpleGraph('t8', 'substring', { start: 0, end: 3 });
    const builder = await createBuilder('test-builder-substring', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('hel');
  });

  // 9. substring with negative end
  it('substring with negative end index: verify behavior', async () => {
    const graph = simpleGraph('t9', 'substring', { start: 0, end: -1 });
    const builder = await createBuilder('test-builder-substring-neg', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // JS String.substring treats negative indices as 0, so 'hello'.substring(0, -1) === 'hello'.substring(0, 0) === ''
    expect(body.value).toBe('');
  });

  // 10. to_uppercase
  it('to_uppercase: hello → HELLO', async () => {
    const graph = simpleGraph('t10', 'to_uppercase', {});
    const builder = await createBuilder('test-builder-uppercase', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('HELLO');
  });

  // 11. to_lowercase
  it('to_lowercase: HELLO → hello', async () => {
    const graph = simpleGraph('t11', 'to_lowercase', {});
    const builder = await createBuilder('test-builder-lowercase', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'HELLO' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('hello');
  });

  // 12. concatenate with 2 inputs (a/b handles)
  it('concatenate (a + b): word + literal → word-suffix', async () => {
    const inputNode = {
      id: 'input-1',
      type: 'attribute_input',
      position: { x: 0, y: 0 },
      data: { attributeIdentifier: 'word' },
    };
    const literalNode = {
      id: 'lit-1',
      type: 'literal_value',
      position: { x: 0, y: 100 },
      data: { value: 'suffix' },
    };
    const sepNode = {
      id: 'sep-1',
      type: 'literal_value',
      position: { x: 0, y: 200 },
      data: { value: '-' },
    };
    const concatNode = {
      id: 'concat-1',
      type: 'concatenate',
      position: { x: 200, y: 0 },
      data: {},
    };
    const returnNode = {
      id: 'return-1',
      type: 'return_builder',
      position: { x: 400, y: 0 },
      data: {},
    };

    const graph = {
      nodes: [inputNode, literalNode, sepNode, concatNode, returnNode],
      edges: [
        { id: 'e1', source: 'input-1', sourceHandle: 'output', target: 'concat-1', targetHandle: 'a' },
        { id: 'e2', source: 'lit-1', sourceHandle: 'output', target: 'concat-1', targetHandle: 'b' },
        { id: 'e-sep', source: 'sep-1', sourceHandle: 'output', target: 'concat-1', targetHandle: 'separator' },
        { id: 'e3', source: 'concat-1', sourceHandle: 'output', target: 'return-1', targetHandle: 'value' },
      ],
    };

    const builder = await createBuilder('test-builder-concat-2', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'word' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('word-suffix');
  });

  // 13. concatenate with 3 inputs (input_0/input_1/input_2 + separator)
  it('concatenate (3 inputs with separator): a-b-c', async () => {
    const lit0 = {
      id: 'lit-0',
      type: 'literal_value',
      position: { x: 0, y: 0 },
      data: { value: 'alpha' },
    };
    const lit1 = {
      id: 'lit-1',
      type: 'literal_value',
      position: { x: 0, y: 80 },
      data: { value: 'beta' },
    };
    const lit2 = {
      id: 'lit-2',
      type: 'literal_value',
      position: { x: 0, y: 160 },
      data: { value: 'gamma' },
    };
    const sepNode = {
      id: 'sep-1',
      type: 'literal_value',
      position: { x: 0, y: 240 },
      data: { value: '-' },
    };
    const concatNode = {
      id: 'concat-1',
      type: 'concatenate',
      position: { x: 200, y: 0 },
      data: {},
    };
    const returnNode = {
      id: 'return-1',
      type: 'return_builder',
      position: { x: 400, y: 0 },
      data: {},
    };

    const graph = {
      nodes: [lit0, lit1, lit2, sepNode, concatNode, returnNode],
      edges: [
        { id: 'e0', source: 'lit-0', sourceHandle: 'output', target: 'concat-1', targetHandle: 'input_0' },
        { id: 'e1', source: 'lit-1', sourceHandle: 'output', target: 'concat-1', targetHandle: 'input_1' },
        { id: 'e2', source: 'lit-2', sourceHandle: 'output', target: 'concat-1', targetHandle: 'input_2' },
        { id: 'e-sep', source: 'sep-1', sourceHandle: 'output', target: 'concat-1', targetHandle: 'separator' },
        { id: 'e3', source: 'concat-1', sourceHandle: 'output', target: 'return-1', targetHandle: 'value' },
      ],
    };

    const builder = await createBuilder('test-builder-concat-3', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'ignored' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('alpha-beta-gamma');
  });

  // 14. get_last_n(3)
  it('get_last_n(3): hello → llo', async () => {
    const graph = simpleGraph('t14', 'get_last_n', { n: 3 });
    const builder = await createBuilder('test-builder-get-last', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('llo');
  });

  // 15. get_first_n(3)
  it('get_first_n(3): hello → hel', async () => {
    const graph = simpleGraph('t15', 'get_first_n', { n: 3 });
    const builder = await createBuilder('test-builder-get-first', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'hello' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('hel');
  });

  // 16. lookup_in_map with word_type attribute
  it('lookup_in_map: word_type Noun → n', async () => {
    const inputNode = {
      id: 'input-1',
      type: 'attribute_input',
      position: { x: 0, y: 0 },
      data: { attributeIdentifier: 'word_type' },
    };
    const lookupNode = {
      id: 'lookup-1',
      type: 'lookup_in_map',
      position: { x: 200, y: 0 },
      data: { map: { Noun: 'n', Verb: 'v', Adjective: 'adj' }, defaultValue: 'x' },
    };
    const returnNode = {
      id: 'return-1',
      type: 'return_builder',
      position: { x: 400, y: 0 },
      data: {},
    };

    const graph = {
      nodes: [inputNode, lookupNode, returnNode],
      edges: [
        { id: 'e1', source: 'input-1', sourceHandle: 'output', target: 'lookup-1', targetHandle: 'key' },
        { id: 'e2', source: 'lookup-1', sourceHandle: 'output', target: 'return-1', targetHandle: 'value' },
      ],
    };

    const builder = await createBuilder('test-builder-lookup', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'test', word_type: 'Noun' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('n');
  });

  // 17. lookup_in_map — key not found, returns default
  it('lookup_in_map: key not found → default', async () => {
    const inputNode = {
      id: 'input-1',
      type: 'attribute_input',
      position: { x: 0, y: 0 },
      data: { attributeIdentifier: 'word_type' },
    };
    const lookupNode = {
      id: 'lookup-1',
      type: 'lookup_in_map',
      position: { x: 200, y: 0 },
      data: { map: { Noun: 'n', Verb: 'v' }, defaultValue: 'unknown' },
    };
    const returnNode = {
      id: 'return-1',
      type: 'return_builder',
      position: { x: 400, y: 0 },
      data: {},
    };

    const graph = {
      nodes: [inputNode, lookupNode, returnNode],
      edges: [
        { id: 'e1', source: 'input-1', sourceHandle: 'output', target: 'lookup-1', targetHandle: 'key' },
        { id: 'e2', source: 'lookup-1', sourceHandle: 'output', target: 'return-1', targetHandle: 'value' },
      ],
    };

    const builder = await createBuilder('test-builder-lookup-default', graph);
    cleanupIds.push(builder.id);

    const res = await testBuilder(builder.id, { word: 'test', word_type: 'Preposition' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('unknown');
  });

  // 18. Complex graph with if_branch + merge
  it('if_branch + merge: branches based on condition', async () => {
    const inputNode = {
      id: 'input-1',
      type: 'attribute_input',
      position: { x: 0, y: 0 },
      data: { attributeIdentifier: 'word' },
    };
    const conditionInput = {
      id: 'cond-input',
      type: 'attribute_input',
      position: { x: 0, y: 100 },
      data: { attributeIdentifier: 'word_type' },
    };
    const verbLiteral = {
      id: 'verb-lit',
      type: 'literal_value',
      position: { x: 0, y: 200 },
      data: { value: 'Verb' },
    };
    const equalsNode = {
      id: 'equals-1',
      type: 'equals',
      position: { x: 150, y: 100 },
      data: {},
    };
    const branchNode = {
      id: 'branch-1',
      type: 'if_branch',
      position: { x: 300, y: 0 },
      data: {},
    };
    const appendNode = {
      id: 'append-true',
      type: 'append',
      position: { x: 450, y: -50 },
      data: { suffix: '-verb' },
    };
    const appendFalse = {
      id: 'append-false',
      type: 'append',
      position: { x: 450, y: 50 },
      data: { suffix: '-other' },
    };
    const mergeNode = {
      id: 'merge-1',
      type: 'merge',
      position: { x: 600, y: 0 },
      data: {},
    };
    const returnNode = {
      id: 'return-1',
      type: 'return_builder',
      position: { x: 750, y: 0 },
      data: {},
    };

    const graph = {
      nodes: [inputNode, conditionInput, verbLiteral, equalsNode, branchNode, appendNode, appendFalse, mergeNode, returnNode],
      edges: [
        { id: 'e1a', source: 'cond-input', sourceHandle: 'output', target: 'equals-1', targetHandle: 'a' },
        { id: 'e1b', source: 'verb-lit', sourceHandle: 'output', target: 'equals-1', targetHandle: 'b' },
        { id: 'e2', source: 'input-1', sourceHandle: 'output', target: 'branch-1', targetHandle: 'value' },
        { id: 'e3', source: 'equals-1', sourceHandle: 'output', target: 'branch-1', targetHandle: 'condition' },
        { id: 'e4', source: 'branch-1', sourceHandle: 'true', target: 'append-true', targetHandle: 'input' },
        { id: 'e5', source: 'branch-1', sourceHandle: 'false', target: 'append-false', targetHandle: 'input' },
        { id: 'e6', source: 'append-true', sourceHandle: 'output', target: 'merge-1', targetHandle: 'true' },
        { id: 'e7', source: 'append-false', sourceHandle: 'output', target: 'merge-1', targetHandle: 'false' },
        { id: 'e8', source: 'merge-1', sourceHandle: 'output', target: 'return-1', targetHandle: 'value' },
      ],
    };

    const builder = await createBuilder('test-builder-branch-merge', graph);
    cleanupIds.push(builder.id);

    // Test true branch (Verb)
    const res1 = await testBuilder(builder.id, { word: 'run', word_type: 'Verb' });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().value).toBe('run-verb');

    // Test false branch (Noun)
    const res2 = await testBuilder(builder.id, { word: 'tree', word_type: 'Noun' });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().value).toBe('tree-other');
  });

  // 19. derivative_input reading past_tense derivative value
  it('derivative_input reads another derivative value', async () => {
    // Create a verb word so past_tense derivative is generated
    const word = await createWord(app, adminCookies, projectId, {
      word: 'tesari',
      translation: 'to test',
      word_type: 'Verb',
    });
    const wordId = word.id;

    // Build a builder that reads the past_tense derivative
    const derivInput = {
      id: 'deriv-input-1',
      type: 'derivative_input',
      position: { x: 0, y: 0 },
      data: { derivativeIdentifier: 'past_tense' },
    };
    const appendNode = {
      id: 'append-1',
      type: 'append',
      position: { x: 200, y: 0 },
      data: { suffix: '-modified' },
    };
    const returnNode = {
      id: 'return-1',
      type: 'return_builder',
      position: { x: 400, y: 0 },
      data: {},
    };

    const graph = {
      nodes: [derivInput, appendNode, returnNode],
      edges: [
        { id: 'e1', source: 'deriv-input-1', sourceHandle: 'output', target: 'append-1', targetHandle: 'input' },
        { id: 'e2', source: 'append-1', sourceHandle: 'output', target: 'return-1', targetHandle: 'value' },
      ],
    };

    const builder = await createBuilder('test-builder-deriv-input', graph);
    cleanupIds.push(builder.id);

    // Test: the past_tense of 'tesari' (ends with vowel) should be 'tesarirath'
    const res = await testBuilder(builder.id, {
      word: 'tesari',
      translation: 'to test',
      word_type: 'Verb',
    }, { past_tense: 'tesarirath' });
    expect(res.statusCode).toBe(200);
    expect(res.json().value).toBe('tesarirath-modified');

    // Cleanup word
    await inject(app, adminCookies, {
      method: 'DELETE',
      url: `/api/v1/projects/${projectId}/words/${wordId}`,
    });
  });

  // 20. Multiple if_branch nodes in sequence (nested branching)
  it('nested branching: multiple if_branch nodes', async () => {
    const wordInput = {
      id: 'input-1',
      type: 'attribute_input',
      position: { x: 0, y: 0 },
      data: { attributeIdentifier: 'word' },
    };
    const typeInput = {
      id: 'type-input',
      type: 'attribute_input',
      position: { x: 0, y: 100 },
      data: { attributeIdentifier: 'word_type' },
    };
    // Literal values for comparisons
    const litVerb = {
      id: 'lit-verb',
      type: 'literal_value',
      position: { x: 0, y: 200 },
      data: { value: 'Verb' },
    };
    const litNoun = {
      id: 'lit-noun',
      type: 'literal_value',
      position: { x: 0, y: 300 },
      data: { value: 'Noun' },
    };
    // First condition: is Verb?
    const eqVerb = {
      id: 'eq-verb',
      type: 'equals',
      position: { x: 150, y: 100 },
      data: {},
    };
    const branch1 = {
      id: 'branch-1',
      type: 'if_branch',
      position: { x: 300, y: 0 },
      data: {},
    };
    // True path: append '-v'
    const appendV = {
      id: 'append-v',
      type: 'append',
      position: { x: 450, y: -100 },
      data: { suffix: '-v' },
    };
    // False path: second condition — is Noun?
    const eqNoun = {
      id: 'eq-noun',
      type: 'equals',
      position: { x: 400, y: 200 },
      data: {},
    };
    const branch2 = {
      id: 'branch-2',
      type: 'if_branch',
      position: { x: 500, y: 100 },
      data: {},
    };
    const appendN = {
      id: 'append-n',
      type: 'append',
      position: { x: 650, y: 50 },
      data: { suffix: '-n' },
    };
    const appendX = {
      id: 'append-x',
      type: 'append',
      position: { x: 650, y: 150 },
      data: { suffix: '-x' },
    };
    const merge2 = {
      id: 'merge-2',
      type: 'merge',
      position: { x: 800, y: 100 },
      data: {},
    };
    const merge1 = {
      id: 'merge-1',
      type: 'merge',
      position: { x: 900, y: 0 },
      data: {},
    };
    const returnNode = {
      id: 'return-1',
      type: 'return_builder',
      position: { x: 1050, y: 0 },
      data: {},
    };

    const graph = {
      nodes: [wordInput, typeInput, litVerb, litNoun, eqVerb, branch1, appendV, eqNoun, branch2, appendN, appendX, merge2, merge1, returnNode],
      edges: [
        { id: 'e1a', source: 'type-input', sourceHandle: 'output', target: 'eq-verb', targetHandle: 'a' },
        { id: 'e1b', source: 'lit-verb', sourceHandle: 'output', target: 'eq-verb', targetHandle: 'b' },
        { id: 'e2', source: 'input-1', sourceHandle: 'output', target: 'branch-1', targetHandle: 'value' },
        { id: 'e3', source: 'eq-verb', sourceHandle: 'output', target: 'branch-1', targetHandle: 'condition' },
        // True → append-v
        { id: 'e4', source: 'branch-1', sourceHandle: 'true', target: 'append-v', targetHandle: 'input' },
        // False → branch-2 (is Noun?)
        { id: 'e5', source: 'branch-1', sourceHandle: 'false', target: 'branch-2', targetHandle: 'value' },
        { id: 'e6a', source: 'type-input', sourceHandle: 'output', target: 'eq-noun', targetHandle: 'a' },
        { id: 'e6b', source: 'lit-noun', sourceHandle: 'output', target: 'eq-noun', targetHandle: 'b' },
        { id: 'e7', source: 'eq-noun', sourceHandle: 'output', target: 'branch-2', targetHandle: 'condition' },
        // branch-2 true → append-n
        { id: 'e8', source: 'branch-2', sourceHandle: 'true', target: 'append-n', targetHandle: 'input' },
        // branch-2 false → append-x
        { id: 'e9', source: 'branch-2', sourceHandle: 'false', target: 'append-x', targetHandle: 'input' },
        // merge branch-2
        { id: 'e10', source: 'append-n', sourceHandle: 'output', target: 'merge-2', targetHandle: 'true' },
        { id: 'e11', source: 'append-x', sourceHandle: 'output', target: 'merge-2', targetHandle: 'false' },
        // merge branch-1
        { id: 'e12', source: 'append-v', sourceHandle: 'output', target: 'merge-1', targetHandle: 'true' },
        { id: 'e13', source: 'merge-2', sourceHandle: 'output', target: 'merge-1', targetHandle: 'false' },
        // return
        { id: 'e14', source: 'merge-1', sourceHandle: 'output', target: 'return-1', targetHandle: 'value' },
      ],
    };

    const builder = await createBuilder('test-builder-nested-branch', graph);
    cleanupIds.push(builder.id);

    // Test Verb path
    const r1 = await testBuilder(builder.id, { word: 'run', word_type: 'Verb' });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().value).toBe('run-v');

    // Test Noun path
    const r2 = await testBuilder(builder.id, { word: 'tree', word_type: 'Noun' });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().value).toBe('tree-n');

    // Test other path (Adjective)
    const r3 = await testBuilder(builder.id, { word: 'big', word_type: 'Adjective' });
    expect(r3.statusCode).toBe(200);
    expect(r3.json().value).toBe('big-x');
  });

  // 21. Cascade regeneration: builder update → word derivative updates
  it('cascade regeneration: updating builder graph regenerates word derivatives', async () => {
    // Create a builder that appends '-first'
    const graphV1 = simpleGraph('t21', 'append', { suffix: '-first' });
    const builder = await createBuilder('test-builder-cascade', graphV1);
    cleanupIds.push(builder.id);

    // Create a derivative type using this builder
    const dtBase = `/api/v1/projects/${projectId}/derivative-types`;
    const dtRes = await inject(app, adminCookies, {
      method: 'POST',
      url: dtBase,
      payload: {
        name: 'Cascade Test DT',
        identifier: 'cascade_test_dt',
        builderId: builder.id,
      },
    });
    expect(dtRes.statusCode).toBe(200);
    const dt = dtRes.json();

    // Create a word
    const word = await createWord(app, adminCookies, projectId, {
      word: 'cascara',
      translation: 'cascade test',
      word_type: 'Verb',
    });

    // Check derivative was generated with '-first'
    const wordRes1 = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    expect(wordRes1.statusCode).toBe(200);
    const wordData1 = wordRes1.json();
    const deriv1 = wordData1.derivatives?.find((d: any) => d.identifier === 'cascade_test_dt');
    expect(deriv1).toBeDefined();
    expect(deriv1.value).toBe('cascara-first');

    // Update the builder graph to append '-second' instead
    const graphV2 = simpleGraph('t21', 'append', { suffix: '-second' });
    const updateRes = await inject(app, adminCookies, {
      method: 'PUT',
      url: `${base()}/${builder.id}`,
      payload: { graph: graphV2 },
    });
    expect(updateRes.statusCode).toBe(200);

    // Re-fetch word and check derivative updated
    const wordRes2 = await inject(app, adminCookies, {
      method: 'GET',
      url: `/api/v1/projects/${projectId}/words/${word.id}`,
    });
    expect(wordRes2.statusCode).toBe(200);
    const wordData2 = wordRes2.json();
    const deriv2 = wordData2.derivatives?.find((d: any) => d.identifier === 'cascade_test_dt');
    expect(deriv2).toBeDefined();
    expect(deriv2.value).toBe('cascara-second');

    // Cleanup
    await inject(app, adminCookies, { method: 'DELETE', url: `/api/v1/projects/${projectId}/words/${word.id}` });
    await inject(app, adminCookies, { method: 'DELETE', url: `${dtBase}/${dt.id}` });
  });

  // 22. Version history
  it('version history: created and updated entries', async () => {
    const graphV1 = simpleGraph('t22', 'append', { suffix: '-v1' });
    const builder = await createBuilder('test-builder-versions', graphV1);
    cleanupIds.push(builder.id);

    // Update builder
    const graphV2 = simpleGraph('t22', 'append', { suffix: '-v2' });
    await inject(app, adminCookies, {
      method: 'PUT',
      url: `${base()}/${builder.id}`,
      payload: { graph: graphV2 },
    });

    // Fetch versions
    const versionsRes = await inject(app, adminCookies, {
      method: 'GET',
      url: `${base()}/${builder.id}/versions`,
    });
    expect(versionsRes.statusCode).toBe(200);
    const versions = versionsRes.json().items;
    expect(Array.isArray(versions)).toBe(true);

    const changeTypes = versions.map((v: any) => v.changeType);
    expect(changeTypes).toContain('created');
    expect(changeTypes).toContain('updated');
  });
});
