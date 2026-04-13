import type { NodeDefinition } from '../types.js';
import { runSafeRegex } from '../../../utils/safe-regex.js';

const transformNodes: NodeDefinition[] = [
  {
    type: 'append',
    label: 'Append',
    category: 'Transform',
    description:
      'Adds a configured suffix to the end of the input string and outputs the result. The classic "add -ed / -rath / -s" step at the end of a builder pipeline.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [{ key: 'suffix', label: 'Suffix', type: 'text' }],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const suffix = String(inputs.suffix ?? node.data.suffix ?? '');
      return { output: input + suffix };
    },
  },

  {
    type: 'prepend',
    label: 'Prepend',
    category: 'Transform',
    description:
      'Adds a configured prefix to the beginning of the input string. Handy for class markers or reduplication.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [{ key: 'prefix', label: 'Prefix', type: 'text' }],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const prefix = String(inputs.prefix ?? node.data.prefix ?? '');
      return { output: prefix + input };
    },
  },

  {
    type: 'remove_last_n',
    label: 'Remove Last N',
    category: 'Transform',
    description:
      'Removes the last N characters from the input string. If N is greater than or equal to the string length the result is an empty string — commonly used to strip a known ending before swapping it for another.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [{ key: 'n', label: 'N', type: 'number' }],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const n = Number(inputs.n ?? node.data.n ?? 0);
      return { output: n >= input.length ? '' : input.slice(0, -n) };
    },
  },

  {
    type: 'remove_first_n',
    label: 'Remove First N',
    category: 'Transform',
    description:
      'Removes the first N characters from the input string. Useful for stripping a leading class marker before applying further transforms.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [{ key: 'n', label: 'N', type: 'number' }],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const n = Number(inputs.n ?? node.data.n ?? 0);
      return { output: input.slice(n) };
    },
  },

  {
    type: 'replace',
    label: 'Replace',
    category: 'Transform',
    description:
      'Replaces every occurrence of a substring with another string. This is a literal (non-regex) replacement — for a pattern-based version use Replace Pattern instead.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [
      { key: 'search', label: 'Search', type: 'text' },
      { key: 'replaceWith', label: 'Replace With', type: 'text' },
    ],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const search = String(inputs.search ?? node.data.search ?? '');
      const replaceWith = String(inputs.replaceWith ?? node.data.replaceWith ?? '');
      return { output: input.split(search).join(replaceWith) };
    },
  },

  {
    type: 'replace_pattern',
    label: 'Replace Pattern',
    category: 'Transform',
    description:
      'Regex-based find and replace. Accepts a pattern and replacement string plus optional flags — for example, replacing all vowels or applying ablaut by matching groups.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [
      { key: 'pattern', label: 'Pattern', type: 'regex' },
      { key: 'replaceWith', label: 'Replace With', type: 'text' },
      { key: 'flags', label: 'Flags', type: 'text' },
    ],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const pattern = String(inputs.pattern ?? node.data.pattern ?? '');
      const replaceWith = String(inputs.replaceWith ?? node.data.replaceWith ?? '');
      const flags = String(node.data.flags ?? 'g');
      const result = runSafeRegex(pattern, flags, input, (re, s) => s.replace(re, replaceWith));
      return { output: result.ok ? (result.value as string) : input };
    },
  },

  {
    type: 'substring',
    label: 'Substring',
    category: 'Transform',
    description:
      'Extracts a portion of the input string by start (inclusive) and optional end (exclusive) index. Negative indexes are not supported — use Get First N or Get Last N for those cases.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [
      { key: 'start', label: 'Start', type: 'number' },
      { key: 'end', label: 'End', type: 'number' },
    ],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const start = Number(inputs.start ?? node.data.start ?? 0);
      const end = inputs.end != null ? Number(inputs.end) : (node.data.end != null ? Number(node.data.end) : undefined);
      return { output: input.substring(start, end) };
    },
  },

  {
    type: 'to_uppercase',
    label: 'To Uppercase',
    category: 'Transform',
    description:
      'Converts the input string to uppercase. Applies locale-agnostic uppercasing using JavaScript default rules.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    execute: (_node, inputs) => {
      return { output: String(inputs.input ?? '').toUpperCase() };
    },
  },

  {
    type: 'to_lowercase',
    label: 'To Lowercase',
    category: 'Transform',
    description:
      'Converts the input string to lowercase. Useful as a normalization step before comparisons or as a transform in case-insensitive derivative flows.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    execute: (_node, inputs) => {
      return { output: String(inputs.input ?? '').toLowerCase() };
    },
  },

  {
    type: 'concatenate',
    label: 'Concatenate',
    category: 'Transform',
    description:
      'Joins two or more string inputs together. Supports a configurable separator which is inserted between non-empty parts — useful for hyphenated or dotted compound forms.',
    inputs: [
      { id: 'a', label: 'A', type: 'string' },
      { id: 'b', label: 'B', type: 'string' },
    ],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [{ key: 'separator', label: 'Separator', type: 'text' }],
    execute: (_node, inputs) => {
      const parts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const key = `input_${i}`;
        if (inputs[key] !== undefined && inputs[key] !== null) {
          parts.push(String(inputs[key]));
        }
      }
      if (parts.length === 0) {
        if (inputs.a !== undefined) parts.push(String(inputs.a ?? ''));
        if (inputs.b !== undefined) parts.push(String(inputs.b ?? ''));
      }
      const separator = String(inputs.separator ?? '');
      return { output: parts.join(separator) };
    },
  },

  {
    type: 'get_last_n',
    label: 'Get Last N',
    category: 'Transform',
    description:
      'Returns the last N characters of the input string. Typically used to inspect a word ending before branching — for example, "what sound does this word end in?".',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [{ key: 'n', label: 'N', type: 'number' }],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const n = Number(inputs.n ?? node.data.n ?? 0);
      return { output: input.slice(-n) };
    },
  },

  {
    type: 'get_first_n',
    label: 'Get First N',
    category: 'Transform',
    description:
      'Returns the first N characters of the input string. Useful for prefix inspection without destructively slicing the original word.',
    inputs: [{ id: 'input', label: 'Input', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [{ key: 'n', label: 'N', type: 'number' }],
    execute: (node, inputs) => {
      const input = String(inputs.input ?? '');
      const n = Number(inputs.n ?? node.data.n ?? 0);
      return { output: input.slice(0, n) };
    },
  },

  {
    type: 'lookup_in_map',
    label: 'Lookup in Map',
    category: 'Transform',
    description:
      'Given a key, returns the corresponding value from a key→value map configured on the node. A default value may also be configured for keys that are not present — great for phenomena like vowel harmony.',
    inputs: [{ id: 'key', label: 'Key', type: 'string' }],
    outputs: [{ id: 'output', label: 'Result', type: 'string' }],
    configFields: [
      { key: 'map', label: 'Map (key→value)', type: 'map' },
      { key: 'defaultValue', label: 'Default', type: 'text' },
    ],
    execute: (node, inputs) => {
      const key = String(inputs.key ?? '');
      const map = (node.data.map ?? {}) as Record<string, string>;
      const defaultValue = node.data.defaultValue as string | undefined;
      return { output: map[key] ?? defaultValue ?? null };
    },
  },
];

export default transformNodes;
