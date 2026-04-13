import apiClient from '@/api/client';

export interface VariableItem {
  value: string | number | boolean;
  label?: string;
}

export interface Variable {
  id: string;
  projectId: string;
  name: string;
  kind: 'constant' | 'array';
  dataType: 'string' | 'one-of' | 'integer' | 'boolean';
  items: VariableItem[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVariableData {
  name: string;
  kind?: 'constant' | 'array';
  dataType?: Variable['dataType'];
  items: VariableItem[];
  description?: string;
}

export interface UpdateVariableData {
  name?: string;
  kind?: 'constant' | 'array';
  dataType?: Variable['dataType'];
  items?: VariableItem[];
  description?: string;
}

export interface VariableVersion {
  id: string;
  entityId: string;
  versionNumber: number;
  changeType: 'created' | 'updated' | 'deleted';
  snapshot: Variable;
  userId: string;
  userName: string;
  createdAt: string;
}

export async function getVariables(projectId: string) {
  const { data } = await apiClient.get<{ items: Variable[] }>(
    `/projects/${projectId}/variables`,
  );
  return data;
}

export async function createVariable(projectId: string, payload: CreateVariableData) {
  const { data } = await apiClient.post<Variable>(
    `/projects/${projectId}/variables`,
    payload,
  );
  return data;
}

export async function getVariable(projectId: string, id: string) {
  const { data } = await apiClient.get<Variable>(
    `/projects/${projectId}/variables/${id}`,
  );
  return data;
}

export async function updateVariable(
  projectId: string,
  id: string,
  payload: UpdateVariableData,
) {
  const { data } = await apiClient.put<Variable>(
    `/projects/${projectId}/variables/${id}`,
    payload,
  );
  return data;
}

export async function deleteVariable(projectId: string, id: string) {
  await apiClient.delete(`/projects/${projectId}/variables/${id}`);
}

export async function getVariableVersions(projectId: string, id: string) {
  const { data } = await apiClient.get<{ items: VariableVersion[] }>(
    `/projects/${projectId}/variables/${id}/versions`,
  );
  return data;
}
