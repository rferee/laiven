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

export interface TraceStep {
  nodeId: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

export type EditorMode = 'rule' | 'builder';

export interface NodeCategory {
  name: string;
  nodes: NodeTypeInfo[];
}

export interface NodeTypeInfo {
  type: string;
  label: string;
  category: string;
  description: string;
  inputs: PortInfo[];
  outputs: PortInfo[];
  configFields?: ConfigField[];
}

export interface PortInfo {
  id: string;
  label: string;
  type: 'string' | 'boolean' | 'number' | 'any' | 'array';
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'map' | 'attribute' | 'variable' | 'regex' | 'literal';
  options?: string[];
  description?: string;
}
