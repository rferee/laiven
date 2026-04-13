import apiClient from '@/api/client';

export interface DerivativeValue {
  derivativeTypeId: string;
  derivativeTypeName: string;
  value: string | null;
  isUserModified: boolean;
  suggestedValue?: string | null;
}

export interface Word {
  id: string;
  projectId: string;
  attributeValues: Record<string, unknown>;
  derivatives: DerivativeValue[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface WordListItem {
  id: string;
  attributeValues: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WordListResponse {
  items: WordListItem[];
  nextCursor?: string;
  total?: number;
}

export interface WordListParams {
  cursor?: string;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface CreateWordData {
  attributeValues: Record<string, unknown>;
}

export interface UpdateWordData {
  attributeValues: Record<string, unknown>;
}

export interface WordVersion {
  id: string;
  entityId: string;
  versionNumber: number;
  changeType: 'created' | 'updated' | 'deleted';
  snapshot: Word;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface SearchQuery {
  text?: string;
  conditions?: SearchCondition[];
  logic?: 'AND' | 'OR' | 'NOT';
  sort?: { field: string; order: 'asc' | 'desc' };
  cursor?: string;
  limit?: number;
}

export interface SearchCondition {
  type: 'attribute' | 'derivative';
  field: string;
  operator: string;
  value?: unknown;
  children?: SearchCondition[];
  logic?: 'AND' | 'OR' | 'NOT';
}

export async function getWords(projectId: string, params?: WordListParams) {
  const { data } = await apiClient.get<WordListResponse>(
    `/projects/${projectId}/words`,
    { params },
  );
  return data;
}

export async function createWord(projectId: string, payload: CreateWordData) {
  const { data } = await apiClient.post<Word>(
    `/projects/${projectId}/words`,
    payload,
  );
  return data;
}

export async function getWord(projectId: string, id: string) {
  const { data } = await apiClient.get<Word>(
    `/projects/${projectId}/words/${id}`,
  );
  return data;
}

export async function updateWord(projectId: string, id: string, payload: UpdateWordData) {
  const { data } = await apiClient.put<Word>(
    `/projects/${projectId}/words/${id}`,
    payload,
  );
  return data;
}

export async function deleteWord(projectId: string, id: string) {
  await apiClient.delete(`/projects/${projectId}/words/${id}`);
}

export async function getWordVersions(projectId: string, id: string) {
  const { data } = await apiClient.get<{ items: WordVersion[] }>(
    `/projects/${projectId}/words/${id}/versions`,
  );
  return data;
}

export async function getWordVersion(
  projectId: string,
  wordId: string,
  versionId: string,
) {
  const { data } = await apiClient.get<WordVersion>(
    `/projects/${projectId}/words/${wordId}/versions/${versionId}`,
  );
  return data;
}

export async function restoreWordVersion(
  projectId: string,
  wordId: string,
  versionId: string,
) {
  const { data } = await apiClient.post<Word>(
    `/projects/${projectId}/words/${wordId}/versions/${versionId}/restore`,
  );
  return data;
}

export async function setDerivativeValue(
  projectId: string,
  wordId: string,
  derivativeTypeId: string,
  value: string,
) {
  const { data } = await apiClient.patch<DerivativeValue>(
    `/projects/${projectId}/words/${wordId}/derivatives/${derivativeTypeId}`,
    { value },
  );
  return data;
}

export async function resetDerivative(
  projectId: string,
  wordId: string,
  derivativeTypeId: string,
) {
  await apiClient.delete(
    `/projects/${projectId}/words/${wordId}/derivatives/${derivativeTypeId}/override`,
  );
}

export async function searchWords(projectId: string, query: SearchQuery) {
  const { data } = await apiClient.post<WordListResponse>(
    `/projects/${projectId}/words/search`,
    query,
  );
  return data;
}
