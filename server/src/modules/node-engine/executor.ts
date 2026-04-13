import type { NodeGraph, GraphNode, GraphEdge, ExecutionContext, ExecutionResult, TraceStep } from './types.js';
import { getNodeExecutor } from './registry.js';

interface NodeState {
  executed: boolean;
  outputs: Record<string, unknown>;
  branchTaken?: string;
}

export function executeGraph(graph: NodeGraph, context: ExecutionContext): ExecutionResult {
  const trace: TraceStep[] = [];
  const nodeMap = new Map<string, GraphNode>();
  const nodeStates = new Map<string, NodeState>();
  const incomingEdges = new Map<string, GraphEdge[]>();
  const outgoingEdges = new Map<string, GraphEdge[]>();

  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
    nodeStates.set(node.id, { executed: false, outputs: {} });
    incomingEdges.set(node.id, []);
    outgoingEdges.set(node.id, []);
  }

  for (const edge of graph.edges) {
    incomingEdges.get(edge.target)?.push(edge);
    outgoingEdges.get(edge.source)?.push(edge);
  }

  const sorted = topologicalSort(graph.nodes, graph.edges);
  if (!sorted) {
    return { success: false, output: null, trace, error: 'Cycle detected in graph' };
  }

  let finalOutput: unknown = null;
  let finalMessage: string | undefined;

  for (const nodeId of sorted) {
    const node = nodeMap.get(nodeId)!;
    const state = nodeStates.get(nodeId)!;
    const executor = getNodeExecutor(node.type);

    if (!executor) {
      trace.push({
        nodeId, nodeType: node.type, inputs: {}, outputs: {},
        status: 'error', error: `Unknown node type: ${node.type}`,
      });
      continue;
    }

    const incoming = incomingEdges.get(nodeId) ?? [];
    let shouldSkip = false;

    if (incoming.length > 0) {
      let hasActiveInput = false;
      for (const edge of incoming) {
        const sourceState = nodeStates.get(edge.source);
        if (!sourceState?.executed) continue;

        const sourceNode = nodeMap.get(edge.source);
        if (sourceNode?.type === 'if_branch') {
          const branchTaken = sourceState.branchTaken;
          // The sourceHandle tells us which branch this edge is on
          if (edge.sourceHandle === branchTaken || edge.sourceHandle === 'output') {
            hasActiveInput = true;
          }
        } else {
          hasActiveInput = true;
        }
      }

      if (incoming.length > 0 && !hasActiveInput) {
        shouldSkip = true;
      }
    }

    if (shouldSkip) {
      state.executed = false;
      trace.push({
        nodeId, nodeType: node.type, inputs: {}, outputs: {},
        status: 'skipped',
      });
      continue;
    }

    const inputs: Record<string, unknown> = {};
    for (const edge of incoming) {
      const sourceState = nodeStates.get(edge.source);
      if (sourceState?.executed) {
        const value = sourceState.outputs[edge.sourceHandle] ?? sourceState.outputs['output'];
        inputs[edge.targetHandle] = value;
      }
    }

    try {
      const outputs = executor(node, inputs, context);
      state.executed = true;
      state.outputs = outputs;

      if (node.type === 'if_branch' && outputs._branch) {
        state.branchTaken = outputs._branch as string;
      }

      trace.push({
        nodeId, nodeType: node.type, inputs, outputs,
        status: 'success',
      });

      if (outputs._terminal) {
        finalOutput = outputs.output;
        finalMessage = outputs.message as string | undefined;
      }
    } catch (err) {
      state.executed = true;
      state.outputs = {};
      trace.push({
        nodeId, nodeType: node.type, inputs, outputs: {},
        status: 'error', error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // If no terminal node found, look for the last executed node's output
  if (finalOutput === null) {
    for (let i = trace.length - 1; i >= 0; i--) {
      if (trace[i].status === 'success' && trace[i].outputs.output !== undefined) {
        finalOutput = trace[i].outputs.output;
        break;
      }
    }
  }

  return {
    success: true,
    output: finalOutput,
    trace,
    error: finalMessage && !finalOutput ? finalMessage : undefined,
  };
}

function topologicalSort(nodes: GraphNode[], edges: GraphEdge[]): string[] | null {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted.length === nodes.length ? sorted : null;
}

// Lets the frontend surface per-field errors without the rule having to
// declare an "owner" attribute up front.
function extractTouchedAttributes(trace: TraceStep[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const step of trace) {
    if (step.status !== 'success') continue;
    if (step.nodeType !== 'attribute_input') continue;
    const identifier = (step.outputs as Record<string, unknown> | undefined)
      ?.attributeIdentifier as string | undefined;
    if (identifier && !seen.has(identifier)) {
      seen.add(identifier);
      ordered.push(identifier);
    }
  }
  return ordered;
}

export function executeRule(
  graph: NodeGraph,
  context: ExecutionContext,
): { pass: boolean; message?: string; trace: TraceStep[]; touchedAttributes: string[] } {
  // Annotate attribute_input nodes with the identifier they read so the
  // trace carries enough information for extractTouchedAttributes.
  const annotatedTrace: TraceStep[] = [];
  const result = executeGraph(graph, context);

  for (const step of result.trace) {
    if (step.nodeType === 'attribute_input' && step.status === 'success') {
      const node = graph.nodes.find(n => n.id === step.nodeId);
      const identifier = node?.data?.attributeIdentifier as string | undefined;
      annotatedTrace.push({
        ...step,
        outputs: { ...step.outputs, attributeIdentifier: identifier },
      });
    } else {
      annotatedTrace.push(step);
    }
  }

  const touchedAttributes = extractTouchedAttributes(annotatedTrace);

  if (!result.success) {
    return { pass: false, message: result.error, trace: annotatedTrace, touchedAttributes };
  }

  return {
    pass: Boolean(result.output),
    message: result.trace.find(t => t.outputs.message)?.outputs.message as string | undefined,
    trace: annotatedTrace,
    touchedAttributes,
  };
}

export function executeBuilder(
  graph: NodeGraph,
  context: ExecutionContext,
): { value: string | null; trace: TraceStep[] } {
  const result = executeGraph(graph, context);

  return {
    value: result.output != null ? String(result.output) : null,
    trace: result.trace,
  };
}
