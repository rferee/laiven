import apiClient from '@/api/client';

export type UniqueMode = 'off' | 'case_sensitive' | 'case_insensitive';

export interface Attribute {
  id: string;
  projectId: string;
  name: string;
  identifier: string;
  type: 'string' | 'one-of' | 'integer' | 'boolean' | 'single-relation' | 'multiple-relation';
  required: boolean;
  displayOrder: number;
  description?: string;
  options?: string[];
  uniqueMode: UniqueMode;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAttributeData {
  name: string;
  type: Attribute['type'];
  required?: boolean;
  description?: string;
  options?: string[];
  uniqueMode?: UniqueMode;
}

export interface UpdateAttributeData {
  name?: string;
  type?: Attribute['type'];
  required?: boolean;
  description?: string;
  options?: string[];
  uniqueMode?: UniqueMode;
}

export interface AttributeVersion {
  id: string;
  entityId: string;
  versionNumber: number;
  changeType: 'created' | 'updated' | 'deleted';
  snapshot: Attribute;
  userId: string;
  userName: string;
  createdAt: string;
}

export async function getAttributes(projectId: string) {
  const { data } = await apiClient.get<{ items: Attribute[] }>(
    `/projects/${projectId}/attributes`,
  );
  return data;
}

export async function createAttribute(projectId: string, payload: CreateAttributeData) {
  const { data } = await apiClient.post<Attribute>(
    `/projects/${projectId}/attributes`,
    payload,
  );
  return data;
}

export async function updateAttribute(
  projectId: string,
  id: string,
  payload: UpdateAttributeData,
) {
  const { data } = await apiClient.put<Attribute>(
    `/projects/${projectId}/attributes/${id}`,
    payload,
  );
  return data;
}

export async function reorderAttribute(
  projectId: string,
  id: string,
  displayOrder: number,
) {
  const { data } = await apiClient.patch<Attribute>(
    `/projects/${projectId}/attributes/${id}/order`,
    { displayOrder },
  );
  return data;
}

export async function deleteAttribute(projectId: string, id: string) {
  await apiClient.delete(`/projects/${projectId}/attributes/${id}`);
}

export async function getAttributeVersions(projectId: string, id: string) {
  const { data } = await apiClient.get<{ items: AttributeVersion[] }>(
    `/projects/${projectId}/attributes/${id}/versions`,
  );
  return data;
}
