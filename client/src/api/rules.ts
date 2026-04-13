import apiClient from '@/api/client';

export interface RuleNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface RuleEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface RuleGraph {
  nodes: RuleNode[];
  edges: RuleEdge[];
}

export interface RuleUsageWordLink {
  linkId: string;
  required: boolean;
  displayOrder: number;
}

export interface RuleUsageDerivative {
  id: string;
  name: string;
  required: boolean;
  displayOrder: number;
}

export interface RuleUsage {
  asWordRule: RuleUsageWordLink | null;
  derivativeTypes: RuleUsageDerivative[];
}

export interface Rule {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  graph: RuleGraph;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  usage: RuleUsage;
}

export interface CreateRuleData {
  name: string;
  description?: string | null;
  enabled?: boolean;
  graph: RuleGraph;
}

export interface UpdateRuleData {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  graph?: RuleGraph;
}

export interface RuleTestInput {
  attributeValues: Record<string, unknown>;
}

export interface RuleTestTrace {
  nodeId: string;
  nodeType: string;
  input: unknown;
  output: unknown;
  passed: boolean;
}

export interface RuleTestResult {
  pass: boolean;
  message?: string;
  trace: RuleTestTrace[];
  touchedAttributes?: string[];
}

export interface RuleVersion {
  id: string;
  entityId: string;
  versionNumber: number;
  changeType: 'created' | 'updated' | 'deleted';
  snapshot: Rule;
  userId: string;
  userName: string;
  createdAt: string;
}

export async function getRules(projectId: string) {
  const { data } = await apiClient.get<{ items: Rule[] }>(
    `/projects/${projectId}/rules`,
  );
  return data;
}

export async function createRule(projectId: string, payload: CreateRuleData) {
  const { data } = await apiClient.post<Rule>(
    `/projects/${projectId}/rules`,
    payload,
  );
  return data;
}

export async function getRule(projectId: string, id: string) {
  const { data } = await apiClient.get<Rule>(
    `/projects/${projectId}/rules/${id}`,
  );
  return data;
}

export async function updateRule(projectId: string, id: string, payload: UpdateRuleData) {
  const { data } = await apiClient.put<Rule>(
    `/projects/${projectId}/rules/${id}`,
    payload,
  );
  return data;
}

export async function deleteRule(projectId: string, id: string) {
  await apiClient.delete(`/projects/${projectId}/rules/${id}`);
}

export async function testRule(projectId: string, id: string, input: RuleTestInput) {
  const { data } = await apiClient.post<RuleTestResult>(
    `/projects/${projectId}/rules/${id}/test`,
    input,
  );
  return data;
}

export async function getRuleVersions(projectId: string, id: string) {
  const { data } = await apiClient.get<{ items: RuleVersion[] }>(
    `/projects/${projectId}/rules/${id}/versions`,
  );
  return data;
}
