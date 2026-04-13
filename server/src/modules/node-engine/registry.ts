import type { NodeDefinition, NodeDefinitionPublic, NodeExecutor } from './types.js';
import inputNodes from './nodes/input-nodes.js';
import conditionNodes from './nodes/condition-nodes.js';
import transformNodes from './nodes/transform-nodes.js';
import flowNodes from './nodes/flow-nodes.js';
import logicNodes from './nodes/logic-nodes.js';

// All node definitions, flattened. Each category module exports an array
// and the order of imports above determines default palette ordering.
const allDefinitions: NodeDefinition[] = [
  ...inputNodes,
  ...conditionNodes,
  ...transformNodes,
  ...flowNodes,
  ...logicNodes,
];

const registry = new Map<string, NodeDefinition>();
for (const def of allDefinitions) {
  if (registry.has(def.type)) {
    throw new Error(`Duplicate node type: ${def.type}`);
  }
  registry.set(def.type, def);
}

export function getNodeExecutor(type: string): NodeExecutor | undefined {
  return registry.get(type)?.execute;
}

/** Returns all node definitions in their JSON-serializable form (no
 * execute function) for consumption by the frontend. */
export function getPublicNodeDefinitions(): NodeDefinitionPublic[] {
  return Array.from(registry.values()).map(({ execute: _execute, ...rest }) => rest);
}
