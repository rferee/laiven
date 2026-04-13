import apiClient from '@/api/client';

export interface BuilderNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface BuilderEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface BuilderGraph {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
}

export interface Builder {
  id: string;
  projectId: string;
  name: string;
  graph: BuilderGraph;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBuilderData {
  name: string;
  graph: BuilderGraph;
}

export interface UpdateBuilderData {
  name?: string;
  graph?: BuilderGraph;
}

export interface BuilderTestInput {
  attributeValues: Record<string, unknown>;
  derivativeValues?: Record<string, string>;
}

export interface BuilderTestTrace {
  nodeId: string;
  nodeType: string;
  input: unknown;
  output: unknown;
}

export interface BuilderTestResult {
  output: string;
  trace: BuilderTestTrace[];
}

export interface BuilderVersion {
  id: string;
  entityId: string;
  versionNumber: number;
  changeType: 'created' | 'updated' | 'deleted';
  snapshot: Builder;
  userId: string;
  userName: string;
  createdAt: string;
}

export async function getBuilders(projectId: string) {
  const { data } = await apiClient.get<{ items: Builder[] }>(
    `/projects/${projectId}/builders`,
  );
  return data;
}

export async function createBuilder(projectId: string, payload: CreateBuilderData) {
  const { data } = await apiClient.post<Builder>(
    `/projects/${projectId}/builders`,
    payload,
  );
  return data;
}

export async function getBuilder(projectId: string, id: string) {
  const { data } = await apiClient.get<Builder>(
    `/projects/${projectId}/builders/${id}`,
  );
  return data;
}

export async function updateBuilder(
  projectId: string,
  id: string,
  payload: UpdateBuilderData,
) {
  const { data } = await apiClient.put<Builder>(
    `/projects/${projectId}/builders/${id}`,
    payload,
  );
  return data;
}

export async function deleteBuilder(projectId: string, id: string) {
  await apiClient.delete(`/projects/${projectId}/builders/${id}`);
}

export async function testBuilder(
  projectId: string,
  id: string,
  input: BuilderTestInput,
) {
  const { data } = await apiClient.post<BuilderTestResult>(
    `/projects/${projectId}/builders/${id}/test`,
    input,
  );
  return data;
}

export async function getBuilderVersions(projectId: string, id: string) {
  const { data } = await apiClient.get<{ items: BuilderVersion[] }>(
    `/projects/${projectId}/builders/${id}/versions`,
  );
  return data;
}
