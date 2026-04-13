export interface NodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

export interface VariableContext {
  kind: 'constant' | 'array';
  dataType: string;
  items: unknown[];
}

export interface ExecutionContext {
  attributeValues: Record<string, unknown>;
  derivativeValues?: Record<string, string | null>;
  variables?: Record<string, VariableContext>;
}

export interface NodeOutput {
  [handle: string]: unknown;
}

export interface TraceStep {
  nodeId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  output: unknown;
  trace: TraceStep[];
  error?: string;
}

export type NodeExecutor = (
  node: GraphNode,
  inputs: Record<string, unknown>,
  context: ExecutionContext,
) => NodeOutput;

/** Port type informs the UI which colour/shape to render and which values
 * are compatible when wiring edges. */
export type PortType = 'string' | 'boolean' | 'number' | 'any' | 'array';

export interface PortInfo {
  id: string;
  label: string;
  type: PortType;
}

/** A configuration field lives on the node itself (not on an input port),
 * and is edited in the node inspector. */
export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'map' | 'attribute' | 'variable' | 'regex' | 'literal';
  options?: string[];
  description?: string;
}

/** Self-contained definition of a node type: metadata + executor.
 * Drop a new definition into the nodes/ registry and it's immediately
 * available in the API, the palette and the executor. */
export interface NodeDefinition {
  type: string;
  label: string;
  category: string;
  description: string;
  inputs: PortInfo[];
  outputs: PortInfo[];
  configFields?: ConfigField[];
  execute: NodeExecutor;
}

/** The JSON-serializable form exposed via GET /api/v1/node-types —
 * excludes the execute function which can't cross the network. */
export type NodeDefinitionPublic = Omit<NodeDefinition, 'execute'>;
