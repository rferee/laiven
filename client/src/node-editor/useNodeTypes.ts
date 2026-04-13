import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { NodeTypeInfo, NodeCategory } from './types';

interface NodeTypesResponse {
  items: NodeTypeInfo[];
}

async function fetchNodeTypes(): Promise<NodeTypeInfo[]> {
  const { data } = await apiClient.get<NodeTypesResponse>('/node-types');
  return data.items ?? [];
}

export interface UseNodeTypesResult {
  nodeTypes: NodeTypeInfo[];
  categories: NodeCategory[];
  getNodeTypeInfo: (type: string) => NodeTypeInfo | undefined;
  isLoading: boolean;
}

/**
 * React Query hook that fetches the full node-type registry from the
 * backend once and caches it indefinitely. The backend is the single
 * source of truth for node metadata (palette entries, ports, config
 * fields, descriptions); the frontend simply renders whatever it sees.
 */
export function useNodeTypes(): UseNodeTypesResult {
  const { data, isLoading } = useQuery({
    queryKey: ['node-types'],
    queryFn: fetchNodeTypes,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const nodeTypes = useMemo<NodeTypeInfo[]>(() => data ?? [], [data]);

  const categories = useMemo<NodeCategory[]>(() => {
    const byName = new Map<string, NodeTypeInfo[]>();
    const order: string[] = [];
    for (const node of nodeTypes) {
      if (!byName.has(node.category)) {
        byName.set(node.category, []);
        order.push(node.category);
      }
      byName.get(node.category)!.push(node);
    }
    return order.map((name) => ({ name, nodes: byName.get(name)! }));
  }, [nodeTypes]);

  const typeIndex = useMemo(() => {
    const map = new Map<string, NodeTypeInfo>();
    for (const node of nodeTypes) map.set(node.type, node);
    return map;
  }, [nodeTypes]);

  const getNodeTypeInfo = useMemo(
    () => (type: string) => typeIndex.get(type),
    [typeIndex],
  );

  return { nodeTypes, categories, getNodeTypeInfo, isLoading };
}
