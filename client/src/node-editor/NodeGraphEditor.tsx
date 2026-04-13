import { useCallback, useMemo, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type Connection,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Center, Loader } from '@mantine/core';
import CustomNode from './CustomNode';
import { NodePalette } from './NodePalette';
import { NodeInspector } from './NodeInspector';
import { TestPanel } from './TestPanel';
import { useNodeTypes } from './useNodeTypes';
import type { NodeGraph, TraceStep, EditorMode, NodeTypeInfo } from './types';

export interface NodeGraphEditorHandle {
  save: () => void;
  toggleTest: () => void;
  isTestOpen: boolean;
}

interface NodeGraphEditorProps {
  mode: EditorMode;
  initialGraph?: NodeGraph;
  attributes?: Array<{ identifier: string; name: string; type: string }>;
  variables?: Array<{ name: string }>;
  onSave: (graph: NodeGraph) => void;
  onTest?: (attributeValues: Record<string, unknown>) => Promise<{
    pass?: boolean;
    value?: string | null;
    trace: TraceStep[];
    message?: string;
  }>;
}

export const NodeGraphEditor = forwardRef<NodeGraphEditorHandle, NodeGraphEditorProps>(function NodeGraphEditor({
  mode,
  initialGraph,
  attributes = [],
  variables = [],
  onSave,
  onTest,
}, ref) {
  const { nodeTypes: registeredNodeTypes, isLoading: isLoadingNodeTypes } =
    useNodeTypes();

  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialGraph?.nodes.map((n) => ({
      ...n,
      type: n.type,
      data: { ...n.data },
    })) ?? [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialGraph?.edges ?? [],
  );
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  // React Flow requires a stable reference for `nodeTypes` — memoize it
  // on the dynamic registry so it only changes when the server registry
  // actually changes (effectively once, because staleTime is Infinity).
  const nodeTypes = useMemo(() => {
    const map: Record<string, typeof CustomNode> = {};
    for (const nt of registeredNodeTypes) {
      map[nt.type] = CustomNode;
    }
    return map;
  }, [registeredNodeTypes]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(
        (eds) =>
          addEdge(
            {
              ...params,
              id: `e-${params.source}-${params.sourceHandle}-${params.target}-${params.targetHandle}`,
            },
            eds,
          ) as any,
      );
    },
    [setEdges],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleAddNode = useCallback(
    (nodeType: NodeTypeInfo) => {
      const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const viewport = rfInstance?.getViewport();
      const position = {
        x: viewport ? -viewport.x / viewport.zoom + 300 : 300,
        y: viewport ? -viewport.y / viewport.zoom + 200 : 200,
      };

      const newNode: Node = {
        id,
        type: nodeType.type,
        position,
        data: {},
      };

      setNodes((nds) => [...nds, newNode] as any);
    },
    [rfInstance, setNodes],
  );

  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));
      if (selectedNode?.id === nodeId) {
        setSelectedNode((prev) => (prev ? { ...prev, data } : null));
      }
    },
    [setNodes, selectedNode],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId),
      );
      setSelectedNode(null);
    },
    [setNodes, setEdges],
  );

  const handleTraceUpdate = useCallback(
    (trace: TraceStep[]) => {
      setNodes((nds) =>
        nds.map((n) => {
          const step = trace.find((t) => t.nodeId === n.id);
          return {
            ...n,
            data: {
              ...n.data,
              _traceStep: step || undefined,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  const handleSave = useCallback(() => {
    const graph: NodeGraph = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type!,
        position: n.position,
        data: Object.fromEntries(
          Object.entries(n.data).filter(([k]) => !k.startsWith('_')),
        ),
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle || 'output',
        target: e.target,
        targetHandle: e.targetHandle || 'input',
      })),
    };
    onSave(graph);
  }, [nodes, edges, onSave]);

  // Expose controls to the parent via ref so buttons can live in the
  // page header instead of floating on the canvas.
  useImperativeHandle(ref, () => ({
    save: handleSave,
    toggleTest: () => setShowTestPanel((v) => !v),
    isTestOpen: showTestPanel,
  }), [handleSave, showTestPanel]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const data = event.dataTransfer.getData('application/laiven-node');
      if (!data) return;

      const nodeType = JSON.parse(data) as NodeTypeInfo;
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds || !rfInstance) return;

      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const newNode: Node = {
        id,
        type: nodeType.type,
        position,
        data: {},
      };

      setNodes((nds) => [...nds, newNode] as any);
    },
    [rfInstance, setNodes],
  );

  // Delay rendering React Flow until we know every node type the server
  // can emit, so the `nodeTypes` registry is complete on first paint and
  // React Flow never falls back to a default renderer for an existing
  // node in the saved graph.
  if (isLoadingNodeTypes) {
    return (
      <Center style={{ height: '100%', width: '100%' }}>
        <Loader />
      </Center>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      {/* Left: Node Palette */}
      <div
        style={{
          width: 240,
          borderRight: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <NodePalette onAddNode={handleAddNode} />
      </div>

      {/* Center: Canvas */}
      <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={(instance) => setRfInstance(instance as any)}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
        >
          <Controls />
          <MiniMap
            pannable
            zoomable
            style={{
              backgroundColor: 'var(--mantine-color-dark-7, #1a1b1e)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
            maskColor="rgba(0, 0, 0, 0.6)"
            nodeColor={() => '#E89768'}
            nodeStrokeColor="var(--mantine-color-default-border)"
          />
          <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
        </ReactFlow>

        {/* Buttons moved to the page header via ref */}
      </div>

      {/* Right: Inspector or Test Panel */}
      <div
        style={{
          width: showTestPanel ? 520 : 260,
          borderLeft: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        {showTestPanel && onTest ? (
          <div
            style={{
              width: 260,
              borderRight: '1px solid var(--mantine-color-default-border)',
              overflow: 'auto',
            }}
          >
            <TestPanel
              mode={mode}
              attributes={attributes}
              onRun={onTest}
              onTraceUpdate={handleTraceUpdate}
            />
          </div>
        ) : null}
        <div style={{ width: 260, overflow: 'auto' }}>
          <NodeInspector
            node={selectedNode}
            attributes={attributes}
            variables={variables}
            onUpdateNodeData={handleUpdateNodeData}
            onDeleteNode={handleDeleteNode}
          />
        </div>
      </div>
    </div>
  );
});
