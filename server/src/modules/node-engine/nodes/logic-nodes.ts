import type { NodeDefinition } from '../types.js';

const logicNodes: NodeDefinition[] = [
  {
    type: 'and',
    label: 'AND',
    category: 'Logic',
    description:
      'Boolean AND: outputs true only when every connected input is true. Use it to combine multiple conditions that must all hold — e.g. "word type is verb AND word ends in vowel".',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean' },
      { id: 'b', label: 'B', type: 'boolean' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const values: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        const key = `input_${i}`;
        if (inputs[key] !== undefined) values.push(Boolean(inputs[key]));
      }
      if (values.length === 0) {
        if (inputs.a !== undefined) values.push(Boolean(inputs.a));
        if (inputs.b !== undefined) values.push(Boolean(inputs.b));
      }
      return { output: values.length > 0 && values.every(v => v) };
    },
  },

  {
    type: 'or',
    label: 'OR',
    category: 'Logic',
    description:
      'Boolean OR: outputs true when at least one connected input is true. Use it when any of several alternative conditions should trigger the same branch.',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean' },
      { id: 'b', label: 'B', type: 'boolean' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const values: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        const key = `input_${i}`;
        if (inputs[key] !== undefined) values.push(Boolean(inputs[key]));
      }
      if (values.length === 0) {
        if (inputs.a !== undefined) values.push(Boolean(inputs.a));
        if (inputs.b !== undefined) values.push(Boolean(inputs.b));
      }
      return { output: values.some(v => v) };
    },
  },

  {
    type: 'not',
    label: 'NOT',
    category: 'Logic',
    description:
      'Boolean NOT: outputs the inverse of the input boolean. Wrap any condition in NOT to negate its meaning without rewriting it.',
    inputs: [{ id: 'input', label: 'Input', type: 'boolean' }],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      return { output: !Boolean(inputs.input) };
    },
  },
];

export default logicNodes;
