import type { NodeDefinition } from '../types.js';

const flowNodes: NodeDefinition[] = [
  {
    type: 'if_branch',
    label: 'If / Branch',
    category: 'Flow Control',
    description:
      'Takes a boolean condition and a value and routes that value to either the "True" output or the "False" output depending on the condition. Downstream nodes connected to the non-taken branch are skipped.',
    inputs: [
      { id: 'condition', label: 'Condition', type: 'boolean' },
      { id: 'value', label: 'Value', type: 'any' },
    ],
    outputs: [
      { id: 'true', label: 'True', type: 'any' },
      { id: 'false', label: 'False', type: 'any' },
    ],
    execute: (_node, inputs) => {
      const condition = Boolean(inputs.condition);
      if (condition) {
        return { true: inputs.value ?? true, _branch: 'true' };
      } else {
        return { false: inputs.value ?? false, _branch: 'false' };
      }
    },
  },

  {
    type: 'return_rule',
    label: 'Return (Rule)',
    category: 'Flow Control',
    description:
      'Terminal node for a rule graph. Outputs pass (true) or fail (false) based on the boolean input, and can carry an optional message shown to the user when a required rule fails.',
    inputs: [{ id: 'pass', label: 'Pass', type: 'boolean' }],
    outputs: [],
    configFields: [{ key: 'message', label: 'Message', type: 'text' }],
    execute: (node, inputs) => {
      const pass = inputs.pass !== undefined ? Boolean(inputs.pass) : Boolean(node.data.pass ?? true);
      const message = inputs.message ?? node.data.message ?? '';
      return { output: pass, message: String(message), _terminal: true, _type: 'rule' };
    },
  },

  {
    type: 'return_builder',
    label: 'Return (Builder)',
    category: 'Flow Control',
    description:
      'Terminal node for a builder graph. Outputs the final constructed string that becomes the derivative value for the current word.',
    inputs: [{ id: 'value', label: 'Value', type: 'string' }],
    outputs: [],
    execute: (_node, inputs) => {
      const value = inputs.value ?? inputs.input ?? '';
      return { output: String(value), _terminal: true, _type: 'builder' };
    },
  },

  {
    type: 'merge',
    label: 'Merge',
    category: 'Flow Control',
    description:
      'Joins two branches of an If/Branch back into a single path, taking whichever branch was active. Use this when both branches flow into common downstream nodes.',
    inputs: [
      { id: 'true', label: 'True Path', type: 'any' },
      { id: 'false', label: 'False Path', type: 'any' },
    ],
    outputs: [{ id: 'output', label: 'Output', type: 'any' }],
    execute: (_node, inputs) => {
      const value = inputs.true ?? inputs.false ?? inputs.input ?? null;
      return { output: value };
    },
  },
];

export default flowNodes;
