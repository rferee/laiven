import type { NodeDefinition } from '../types.js';

const inputNodes: NodeDefinition[] = [
  {
    type: 'attribute_input',
    label: 'Attribute Input',
    category: 'Input',
    description:
      'Reads the value of a specified attribute from the current word. This is the primary way to pull word data into a graph — for example, the word text itself, the word type, or any custom attribute.',
    inputs: [],
    outputs: [{ id: 'output', label: 'Value', type: 'any' }],
    configFields: [{ key: 'attributeIdentifier', label: 'Attribute', type: 'attribute' }],
    execute: (node, _inputs, context) => {
      const identifier = node.data.attributeIdentifier as string;
      const value = context.attributeValues[identifier] ?? null;
      return { output: value };
    },
  },

  {
    type: 'derivative_input',
    label: 'Derivative Input',
    category: 'Input',
    description:
      'Reads the value of another derivative on the current word. Use this inside a builder to compose a new derivative from one already computed — for example, building a past participle from an existing past tense.',
    inputs: [],
    outputs: [{ id: 'output', label: 'Value', type: 'string' }],
    configFields: [{ key: 'derivativeIdentifier', label: 'Derivative', type: 'text' }],
    execute: (node, _inputs, context) => {
      const identifier = node.data.derivativeIdentifier as string;
      const value = context.derivativeValues?.[identifier] ?? null;
      return { output: value };
    },
  },

  {
    type: 'literal_value',
    label: 'Literal Value',
    category: 'Input',
    description:
      'A hardcoded constant that you configure directly on the node. Use it when you need a fixed string, number, or boolean to feed into a downstream comparison or transform — for example, the suffix "ed" or the number 3.',
    inputs: [],
    outputs: [{ id: 'output', label: 'Value', type: 'any' }],
    configFields: [
      {
        key: 'valueType',
        label: 'Type',
        type: 'select',
        options: ['string', 'integer', 'boolean'],
        description: 'How the value should be interpreted.',
      },
      { key: 'value', label: 'Value', type: 'literal' },
    ],
    execute: (node) => {
      const valueType = node.data.valueType as string | undefined;
      const raw = node.data.value;

      switch (valueType) {
        case 'integer': {
          if (raw === null || raw === undefined || raw === '') return { output: 0 };
          const n = Number(raw);
          return { output: Number.isNaN(n) ? 0 : n };
        }
        case 'boolean':
          return { output: raw === true || raw === 'true' };
        case 'string':
          return { output: raw === null || raw === undefined ? '' : String(raw) };
        default:
          return { output: raw ?? null };
      }
    },
  },

  {
    type: 'variable_reference',
    label: 'Variable Reference',
    category: 'Input',
    description:
      'Reads a project-level variable. For Array variables, outputs the list of items (commonly wired into Contains/Starts/Ends/Is One Of nodes). For Constant variables, outputs the single stored value.',
    inputs: [],
    outputs: [{ id: 'output', label: 'Value', type: 'any' }],
    configFields: [{ key: 'variableName', label: 'Variable', type: 'variable' }],
    execute: (node, _inputs, context) => {
      const name = node.data.variableName as string;
      const variable = context.variables?.[name];
      if (!variable) return { output: null };
      // Constants return the single value; arrays return the list
      if (variable.kind === 'constant') {
        return { output: variable.items[0] ?? null };
      }
      return { output: variable.items };
    },
  },
];

export default inputNodes;
