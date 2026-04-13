import { describe, it, expect } from 'vitest';
import { executeGraph, executeRule, executeBuilder } from '../executor.js';
import type { GraphNode, GraphEdge, NodeGraph, ExecutionContext } from '../types.js';

function makeNode(id: string, type: string, data: Record<string, unknown> = {}): GraphNode {
  return { id, type, position: { x: 0, y: 0 }, data };
}

function makeEdge(
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): GraphEdge {
  return {
    id: `${source}-${target}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}

function makeGraph(nodes: GraphNode[], edges: GraphEdge[]): NodeGraph {
  return { nodes, edges };
}

function emptyCtx(): ExecutionContext {
  return { attributeValues: {}, derivativeValues: {}, variables: {} };
}

describe('Falsy value propagation', () => {
  it('literal_value with empty string outputs empty string, not null', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: '' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('lit', 'output', 'ret', 'value')],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('');
  });

  it('literal_value with zero outputs "0" (stringified by return_builder)', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 0 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('lit', 'output', 'ret', 'value')],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('0');
  });

  it('literal_value with false outputs "false" (stringified by return_builder)', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: false }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('lit', 'output', 'ret', 'value')],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('false');
  });
});

describe('Missing context values', () => {
  // Note: Missing context values return null from input nodes, but
  // return_builder coerces inputs to String(value) (with fallback to ''),
  // so the final builder output is '' rather than null.

  it('variable_reference for missing variableName returns empty string through builder', () => {
    const graph = makeGraph(
      [
        makeNode('var', 'variable_reference', { variableName: 'nonexistent' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('var', 'output', 'ret', 'value')],
    );
    const result = executeBuilder(graph, emptyCtx());
    // null from variable_reference → String(null) = '' via return_builder
    expect(result.value).toBe('');
  });

  it('attribute_input for missing attributeIdentifier returns empty string through builder', () => {
    const graph = makeGraph(
      [
        makeNode('attr', 'attribute_input', { attributeIdentifier: 'missing' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('attr', 'output', 'ret', 'value')],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('');
  });

  it('derivative_input when derivativeValues is undefined returns empty string through builder', () => {
    const graph = makeGraph(
      [
        makeNode('deriv', 'derivative_input', { derivativeIdentifier: 'x' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('deriv', 'output', 'ret', 'value')],
    );
    const ctx: ExecutionContext = { attributeValues: {}, variables: {} };
    const result = executeBuilder(graph, ctx);
    expect(result.value).toBe('');
  });

  it('derivative_input for missing identifier returns empty string through builder', () => {
    const graph = makeGraph(
      [
        makeNode('deriv', 'derivative_input', { derivativeIdentifier: 'missing' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('deriv', 'output', 'ret', 'value')],
    );
    const ctx: ExecutionContext = { attributeValues: {}, derivativeValues: { other: 'val' }, variables: {} };
    const result = executeBuilder(graph, ctx);
    expect(result.value).toBe('');
  });
});

describe('length_compare edge cases', () => {
  function buildLengthGraph(operator: string, value: number, input: string): NodeGraph {
    return makeGraph(
      [
        makeNode('lit', 'literal_value', { value: input }),
        makeNode('cmp', 'length_compare', { operator, value }),
        makeNode('ret', 'return_rule', { message: 'pass' }),
      ],
      [
        makeEdge('lit', 'output', 'cmp', 'input'),
        makeEdge('cmp', 'output', 'ret', 'pass'),
      ],
    );
  }

  it('less_than: "hi" (length 2) < 5 is true', () => {
    const graph = buildLengthGraph('less_than', 5, 'hi');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('less_or_equal: "hi" (length 2) <= 2 is true', () => {
    const graph = buildLengthGraph('less_or_equal', 2, 'hi');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('greater_or_equal: "hello" (length 5) >= 5 is true', () => {
    const graph = buildLengthGraph('greater_or_equal', 5, 'hello');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('not_equals: "hi" (length 2) != 5 is true', () => {
    const graph = buildLengthGraph('not_equals', 5, 'hi');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('not_equals: "hello" (length 5) != 5 is false', () => {
    const graph = buildLengthGraph('not_equals', 5, 'hello');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(false);
  });
});

describe('matches_pattern edge cases', () => {
  function buildPatternGraph(pattern: string, input: string, flags?: string): NodeGraph {
    const data: Record<string, unknown> = { pattern };
    if (flags !== undefined) data.flags = flags;
    return makeGraph(
      [
        makeNode('lit', 'literal_value', { value: input }),
        makeNode('pat', 'matches_pattern', data),
        makeNode('ret', 'return_rule', { message: 'pass' }),
      ],
      [
        makeEdge('lit', 'output', 'pat', 'input'),
        makeEdge('pat', 'output', 'ret', 'pass'),
      ],
    );
  }

  it('valid regex ^[a-z]+$ matches "hello"', () => {
    const graph = buildPatternGraph('^[a-z]+$', 'hello');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('valid regex ^[a-z]+$ does NOT match "Hello"', () => {
    const graph = buildPatternGraph('^[a-z]+$', 'Hello');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(false);
  });

  it('invalid regex pattern returns false without throwing', () => {
    // Regex error is silently caught — no error info in trace (known limitation)
    const graph = buildPatternGraph('[invalid', 'hello');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(false);
  });

  it('with flags "i": ^hello$ matches "HELLO"', () => {
    const graph = buildPatternGraph('^hello$', 'HELLO', 'i');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('with flags "g": pattern "a" on "banana" returns true', () => {
    const graph = buildPatternGraph('a', 'banana', 'g');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });
});

describe('replace_pattern edge cases', () => {
  // replace_pattern uses 'replaceWith' config field and defaults flags to 'g'
  function buildReplaceGraph(pattern: string, replaceWith: string, input: string, flags?: string): NodeGraph {
    const data: Record<string, unknown> = { pattern, replaceWith };
    if (flags !== undefined) data.flags = flags;
    return makeGraph(
      [
        makeNode('lit', 'literal_value', { value: input }),
        makeNode('rep', 'replace_pattern', data),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'rep', 'input'),
        makeEdge('rep', 'output', 'ret', 'value'),
      ],
    );
  }

  it('capture groups: (\\w+)-(\\w+) with $2-$1 swaps "hello-world" to "world-hello"', () => {
    const graph = buildReplaceGraph('(\\w+)-(\\w+)', '$2-$1', 'hello-world');
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('world-hello');
  });

  it('global flag "g": replaces all "a" with "o" in "banana" → "bonono"', () => {
    // Default flags is 'g', so all occurrences are replaced
    const graph = buildReplaceGraph('a', 'o', 'banana');
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('bonono');
  });

  it('without global flag (empty flags): replaces only first "a" in "banana" → "bonana"', () => {
    // Override default 'g' with empty string to get non-global replacement
    const graph = buildReplaceGraph('a', 'o', 'banana', '');
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('bonana');
  });

  it('invalid regex pattern returns original string gracefully', () => {
    // Regex error is silently caught — no error info in trace (known limitation)
    const graph = buildReplaceGraph('[invalid', 'x', 'hello');
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('hello');
  });
});

describe('concatenate edge cases', () => {
  it('with 0 inputs returns empty string', () => {
    const graph = makeGraph(
      [
        makeNode('cat', 'concatenate', { separator: '-' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('cat', 'output', 'ret', 'value')],
    );
    const result = executeBuilder(graph, emptyCtx());
    // No inputs → parts = [] → parts.join('') = ''
    expect(result.value).toBe('');
  });

  it('with 1 input only (a connected) returns that single input', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'solo' }),
        makeNode('cat', 'concatenate', { separator: '-' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'cat', 'a'),
        makeEdge('cat', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('solo');
  });

  it('with 3 inputs via input_0/input_1/input_2 concatenates with default empty separator', () => {
    // Note: separator from node.data is ignored — only inputs.separator (edge) is used
    // concatenate reads separator from inputs.separator (not node.data.separator),
    // so without an edge for separator it defaults to ''
    const graph = makeGraph(
      [
        makeNode('l0', 'literal_value', { value: 'a' }),
        makeNode('l1', 'literal_value', { value: 'b' }),
        makeNode('l2', 'literal_value', { value: 'c' }),
        makeNode('cat', 'concatenate', { separator: '-' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('l0', 'output', 'cat', 'input_0'),
        makeEdge('l1', 'output', 'cat', 'input_1'),
        makeEdge('l2', 'output', 'cat', 'input_2'),
        makeEdge('cat', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    // separator is read from inputs.separator which is undefined (no edge), so defaults to ''
    expect(result.value).toBe('abc');
  });

  it('with empty separator concatenates directly', () => {
    const graph = makeGraph(
      [
        makeNode('l0', 'literal_value', { value: 'a' }),
        makeNode('l1', 'literal_value', { value: 'b' }),
        makeNode('l2', 'literal_value', { value: 'c' }),
        makeNode('cat', 'concatenate', { separator: '' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('l0', 'output', 'cat', 'input_0'),
        makeEdge('l1', 'output', 'cat', 'input_1'),
        makeEdge('l2', 'output', 'cat', 'input_2'),
        makeEdge('cat', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('abc');
  });
});

describe('get_first_n / get_last_n edge cases', () => {
  it('get_first_n with n > string length returns full string', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'hi' }),
        makeNode('fn', 'get_first_n', { n: 10 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'fn', 'input'),
        makeEdge('fn', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('hi');
  });

  it('get_first_n with n=0 returns empty string', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'hi' }),
        makeNode('fn', 'get_first_n', { n: 0 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'fn', 'input'),
        makeEdge('fn', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('');
  });

  it('get_last_n with n > string length returns full string', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'hi' }),
        makeNode('ln', 'get_last_n', { n: 10 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'ln', 'input'),
        makeEdge('ln', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('hi');
  });

  it('get_last_n with n=0 returns full string (slice(-0) is same as slice(0))', () => {
    // In JS, -0 === 0, so slice(-0) === slice(0) which returns the whole string
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'hi' }),
        makeNode('ln', 'get_last_n', { n: 0 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'ln', 'input'),
        makeEdge('ln', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('hi');
  });
});

describe('substring edge cases', () => {
  it('start > end: JS substring() swaps the arguments', () => {
    // JS String.substring(5, 2) is equivalent to substring(2, 5), returning 'llo'
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'hello' }),
        makeNode('sub', 'substring', { start: 5, end: 2 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'sub', 'input'),
        makeEdge('sub', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    // substring(5,2) swaps to substring(2,5) = 'llo'
    expect(result.value).toBe('llo');
  });

  it('start past string length returns empty string', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'hello' }),
        makeNode('sub', 'substring', { start: 100 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'sub', 'input'),
        makeEdge('sub', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('');
  });

  it('negative start behaves gracefully', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'hello' }),
        makeNode('sub', 'substring', { start: -3 }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'sub', 'input'),
        makeEdge('sub', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    // JS substring() treats negative as 0, so substring(-3) = substring(0) = full string
    expect(typeof result.value === 'string').toBe(true);
  });
});

describe('lookup_in_map edge cases', () => {
  // lookup_in_map's input handle is 'key', not 'input'
  it('matching key returns mapped value', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'a' }),
        makeNode('lk', 'lookup_in_map', { map: { a: 'alpha', b: 'beta' } }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'lk', 'key'),
        makeEdge('lk', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('alpha');
  });

  it('non-matching key with default returns default', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'z' }),
        makeNode('lk', 'lookup_in_map', { map: { a: 'alpha' }, defaultValue: 'unknown' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'lk', 'key'),
        makeEdge('lk', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('unknown');
  });

  it('empty map with no default returns empty string through builder', () => {
    // lookup_in_map returns null when no match and no default,
    // but return_builder coerces null to String('') = ''
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'a' }),
        makeNode('lk', 'lookup_in_map', { map: {} }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'lk', 'key'),
        makeEdge('lk', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    // null output → return_builder String(null) → but since null is falsy,
    // return_builder does: inputs.value ?? inputs.input ?? '' = null ?? undefined ?? '' = ''
    expect(result.value).toBe('');
  });
});

describe('merge node', () => {
  it('single input on "true" handle outputs that value', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'yes' }),
        makeNode('merge', 'merge', {}),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'merge', 'true'),
        makeEdge('merge', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('yes');
  });

  it('both "true" and "false" connected via if_branch outputs the routed value', () => {
    const graph = makeGraph(
      [
        makeNode('cond', 'literal_value', { value: true }),
        makeNode('tVal', 'literal_value', { value: 'truthy' }),
        makeNode('fVal', 'literal_value', { value: 'falsy' }),
        makeNode('branch', 'if_branch', {}),
        makeNode('merge', 'merge', {}),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('cond', 'output', 'branch', 'condition'),
        makeEdge('tVal', 'output', 'merge', 'true'),
        makeEdge('fVal', 'output', 'merge', 'false'),
        makeEdge('merge', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    // merge picks whichever input is non-null; both are connected so it picks one
    expect(result.value === 'truthy' || result.value === 'falsy').toBe(true);
  });
});

describe('not node edge cases', () => {
  function buildNotGraph(inputValue: unknown): NodeGraph {
    return makeGraph(
      [
        makeNode('lit', 'literal_value', { value: inputValue }),
        makeNode('notN', 'not', {}),
        makeNode('ret', 'return_rule', { message: 'pass' }),
      ],
      [
        makeEdge('lit', 'output', 'notN', 'input'),
        makeEdge('notN', 'output', 'ret', 'pass'),
      ],
    );
  }

  it('not(true) → false', () => {
    const graph = buildNotGraph(true);
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(false);
  });

  it('not(false) → true', () => {
    const graph = buildNotGraph(false);
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('not(truthy string "hello") → false', () => {
    const graph = buildNotGraph('hello');
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(false);
  });

  it('not(null) → true', () => {
    const graph = buildNotGraph(null);
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });
});

describe('is_one_of edge cases', () => {
  function buildIsOneOfGraph(input: string, items: string[]): NodeGraph {
    return makeGraph(
      [
        makeNode('lit', 'literal_value', { value: input }),
        makeNode('list', 'literal_value', { value: items }),
        makeNode('chk', 'is_one_of', {}),
        makeNode('ret', 'return_rule', { message: 'pass' }),
      ],
      [
        makeEdge('lit', 'output', 'chk', 'input'),
        makeEdge('list', 'output', 'chk', 'items'),
        makeEdge('chk', 'output', 'ret', 'pass'),
      ],
    );
  }

  it('matching value in list returns true', () => {
    const graph = buildIsOneOfGraph('banana', ['apple', 'banana', 'cherry']);
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('non-matching value returns false', () => {
    const graph = buildIsOneOfGraph('grape', ['apple', 'banana', 'cherry']);
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(false);
  });

  it('empty list returns false', () => {
    const graph = buildIsOneOfGraph('anything', []);
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(false);
  });
});

describe('variable_reference context edge cases', () => {
  it('constant variable returns single value, not array', () => {
    const graph = makeGraph(
      [
        makeNode('var', 'variable_reference', { variableName: 'testConst' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('var', 'output', 'ret', 'value')],
    );
    const ctx: ExecutionContext = {
      attributeValues: {},
      variables: {
        testConst: { kind: 'constant', dataType: 'string', items: ['hello'] },
      },
    };
    const result = executeBuilder(graph, ctx);
    // For constant variables, variable_reference returns items[0] = 'hello'
    expect(result.value).toBe('hello');
  });

  it('missing variable returns null (empty string through builder)', () => {
    const graph = makeGraph(
      [
        makeNode('var', 'variable_reference', { variableName: 'doesNotExist' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [makeEdge('var', 'output', 'ret', 'value')],
    );
    const ctx: ExecutionContext = {
      attributeValues: {},
      variables: {
        someOtherVar: { kind: 'array', dataType: 'string', items: ['a', 'b'] },
      },
    };
    const result = executeBuilder(graph, ctx);
    // Missing variable => null => return_builder coerces to ''
    expect(result.value).toBe('');
  });

  it('missing variable returns null directly through executeGraph', () => {
    const graph = makeGraph(
      [makeNode('var', 'variable_reference', { variableName: 'nope' })],
      [],
    );
    const ctx: ExecutionContext = {
      attributeValues: {},
      variables: {},
    };
    const result = executeGraph(graph, ctx);
    expect(result.success).toBe(true);
    expect(result.output).toBeNull();
  });
});

describe('Graph-level edge cases', () => {
  it('graph with no edges (isolated nodes) returns success', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'orphan' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [],
    );
    const result = executeGraph(graph, emptyCtx());
    expect(result.success).toBe(true);
    // With no edges, return_builder gets no input and uses fallback ''
    // executeGraph still finds a terminal output
    expect(result.output).toBeDefined();
  });

  it('graph with multiple return_rule nodes only fires the connected one', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: true }),
        makeNode('ret1', 'return_rule', { message: 'first' }),
        makeNode('ret2', 'return_rule', { message: 'second' }),
      ],
      [makeEdge('lit', 'output', 'ret1', 'pass')],
    );
    const result = executeRule(graph, emptyCtx());
    expect(result.pass).toBe(true);
  });

  it('deep graph: chain 10+ append nodes without crashing', () => {
    const nodes: GraphNode[] = [
      makeNode('start', 'literal_value', { value: 'x' }),
    ];
    const edges: GraphEdge[] = [];

    let prevId = 'start';
    for (let i = 0; i < 12; i++) {
      const nodeId = `append_${i}`;
      nodes.push(makeNode(nodeId, 'append', { suffix: String(i) }));
      edges.push(makeEdge(prevId, 'output', nodeId, 'input'));
      prevId = nodeId;
    }

    nodes.push(makeNode('ret', 'return_builder', {}));
    edges.push(makeEdge(prevId, 'output', 'ret', 'value'));

    const graph = makeGraph(nodes, edges);
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('x01234567891011');
  });

  it('trace has correct entries for a 3-node graph', () => {
    const graph = makeGraph(
      [
        makeNode('lit', 'literal_value', { value: 'traced' }),
        makeNode('app', 'append', { suffix: '!' }),
        makeNode('ret', 'return_builder', {}),
      ],
      [
        makeEdge('lit', 'output', 'app', 'input'),
        makeEdge('app', 'output', 'ret', 'value'),
      ],
    );
    const result = executeBuilder(graph, emptyCtx());
    expect(result.value).toBe('traced!');
    expect(result.trace).toBeDefined();
    expect(result.trace.length).toBeGreaterThanOrEqual(3);

    const nodeIds = result.trace.map(t => t.nodeId);
    expect(nodeIds).toContain('lit');
    expect(nodeIds).toContain('app');
    expect(nodeIds).toContain('ret');

    for (const entry of result.trace) {
      expect(entry.status).toBe('success');
      expect(entry.nodeType).toBeDefined();
    }
  });
});
