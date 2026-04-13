import type { NodeDefinition } from '../types.js';
import { runSafeRegex } from '../../../utils/safe-regex.js';

const conditionNodes: NodeDefinition[] = [
  {
    type: 'contains_one_of',
    label: 'Contains One Of',
    category: 'Condition',
    description:
      'Returns true if the input string contains any of the items from the connected list. Often paired with a variable reference — for example, "does this word contain any vowel?".',
    inputs: [
      { id: 'input', label: 'Input', type: 'string' },
      { id: 'items', label: 'Items', type: 'array' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const input = String(inputs.input ?? '');
      const items = (inputs.items as unknown[]) ?? [];
      return { output: items.some(item => input.includes(String(item))) };
    },
  },

  {
    type: 'starts_with_one_of',
    label: 'Starts With One Of',
    category: 'Condition',
    description:
      'Returns true if the input string begins with any of the items from the connected list. Useful for detecting prefixes such as a gender marker or a class of consonants at the word start.',
    inputs: [
      { id: 'input', label: 'Input', type: 'string' },
      { id: 'items', label: 'Items', type: 'array' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const input = String(inputs.input ?? '');
      const items = (inputs.items as unknown[]) ?? [];
      return { output: items.some(item => input.startsWith(String(item))) };
    },
  },

  {
    type: 'ends_with_one_of',
    label: 'Ends With One Of',
    category: 'Condition',
    description:
      'Returns true if the input string ends with any of the items from the connected list. Commonly used to branch a builder based on the final sound of a word — for example, "does this word end in a vowel?".',
    inputs: [
      { id: 'input', label: 'Input', type: 'string' },
      { id: 'items', label: 'Items', type: 'array' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const input = String(inputs.input ?? '');
      const items = (inputs.items as unknown[]) ?? [];
      return { output: items.some(item => input.endsWith(String(item))) };
    },
  },

  {
    type: 'equals',
    label: 'Equals',
    category: 'Condition',
    description:
      'Returns true if both inputs are exactly equal. Values are compared as strings after normalization, so connecting an integer attribute on one side and a literal of the same number also compares true.',
    inputs: [
      { id: 'a', label: 'A', type: 'any' },
      { id: 'b', label: 'B', type: 'any' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const a = inputs.a;
      const b = inputs.b;
      return { output: a === b || String(a) === String(b) };
    },
  },

  {
    type: 'not_equals',
    label: 'Not Equals',
    category: 'Condition',
    description:
      'The inverse of Equals: returns true when the two inputs differ. Use this to gate a branch on a mismatch rather than a match.',
    inputs: [
      { id: 'a', label: 'A', type: 'any' },
      { id: 'b', label: 'B', type: 'any' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const a = inputs.a;
      const b = inputs.b;
      return { output: a !== b && String(a) !== String(b) };
    },
  },

  {
    type: 'is_empty',
    label: 'Is Empty',
    category: 'Condition',
    description:
      'Returns true if the input is null, undefined, or an empty string. Useful for validation rules that fire when an attribute has not been filled in.',
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const value = inputs.input;
      return { output: value === null || value === undefined || value === '' };
    },
  },

  {
    type: 'length_compare',
    label: 'Length Compare',
    category: 'Condition',
    description:
      'Compares the string length of the input against a number using the selected operator (equals, greater than, less than, etc.). Typical use: "word length must be greater than 2".',
    inputs: [
      { id: 'input', label: 'Input', type: 'string' },
      { id: 'value', label: 'Value', type: 'number' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    configFields: [
      {
        key: 'operator',
        label: 'Operator',
        type: 'select',
        options: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'],
      },
    ],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const compareValue = Number(inputs.value ?? node.data.value ?? 0);
      const operator = (inputs.operator ?? node.data.operator ?? 'equals') as string;
      const len = input.length;

      let result = false;
      switch (operator) {
        case 'equals': result = len === compareValue; break;
        case 'not_equals': result = len !== compareValue; break;
        case 'greater_than': result = len > compareValue; break;
        case 'less_than': result = len < compareValue; break;
        case 'greater_or_equal': result = len >= compareValue; break;
        case 'less_or_equal': result = len <= compareValue; break;
      }
      return { output: result };
    },
  },

  {
    type: 'matches_pattern',
    label: 'Matches Pattern',
    category: 'Condition',
    description:
      'Tests the input string against a regular expression pattern. Supports standard JavaScript regex syntax and optional flags such as "i" for case-insensitive matching — for example, "^[aeiou]" to check if a word starts with a vowel.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    configFields: [
      { key: 'pattern', label: 'Pattern', type: 'regex' },
      { key: 'flags', label: 'Flags', type: 'text' },
    ],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const pattern = String(inputs.pattern ?? node.data.pattern ?? '');
      const flags = String(node.data.flags ?? '');
      const result = runSafeRegex(pattern, flags, input, (re, s) => re.test(s));
      return { output: result.ok ? (result.value as boolean) : false };
    },
  },

  {
    type: 'is_one_of',
    label: 'Is One Of',
    category: 'Condition',
    description:
      'Returns true if the input value matches exactly one of the items in the connected list. Unlike Contains One Of this is an exact match against each item, not a substring check.',
    inputs: [
      { id: 'input', label: 'Input', type: 'any' },
      { id: 'items', label: 'Items', type: 'array' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const value = inputs.input;
      const items = (inputs.items as unknown[]) ?? [];
      return { output: items.some(item => String(item) === String(value)) };
    },
  },

  {
    type: 'attribute_equals',
    label: 'Attribute Equals',
    category: 'Condition',
    description:
      'Compares two attribute values against each other. Equivalent to Equals but clearly signals that both sides are attribute lookups — useful for "word_type equals other_attribute" style checks.',
    inputs: [
      { id: 'a', label: 'Attribute A', type: 'any' },
      { id: 'b', label: 'Attribute B', type: 'any' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'boolean' }],
    execute: (_node, inputs) => {
      const a = inputs.a;
      const b = inputs.b;
      return { output: String(a) === String(b) };
    },
  },
];

export default conditionNodes;
