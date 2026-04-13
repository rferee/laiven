import type { NodeGraph } from '../modules/node-engine/types.js';

export const MAX_GRAPH_NODES = 500;
export const MAX_GRAPH_EDGES = 2000;

export function validateGraphSize(graph: unknown): { ok: true } | { ok: false; error: string } {
  if (!graph || typeof graph !== 'object') {
    return { ok: false, error: 'graph must be an object' };
  }
  const g = graph as NodeGraph;
  const nodeCount = Array.isArray(g.nodes) ? g.nodes.length : 0;
  const edgeCount = Array.isArray(g.edges) ? g.edges.length : 0;

  if (nodeCount > MAX_GRAPH_NODES) {
    return { ok: false, error: `Graph exceeds maximum of ${MAX_GRAPH_NODES} nodes (got ${nodeCount})` };
  }
  if (edgeCount > MAX_GRAPH_EDGES) {
    return { ok: false, error: `Graph exceeds maximum of ${MAX_GRAPH_EDGES} edges (got ${edgeCount})` };
  }
  return { ok: true };
}
