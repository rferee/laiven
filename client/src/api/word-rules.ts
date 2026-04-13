import apiClient from '@/api/client';

export interface WordRuleLink {
  id: string;
  ruleId: string;
  required: boolean;
  displayOrder: number;
  createdAt: string;
  ruleName: string;
  ruleEnabled: boolean;
  ruleDescription: string | null;
}

export interface CreateWordRuleLinkData {
  ruleId: string;
  required?: boolean;
  displayOrder?: number;
}

export interface UpdateWordRuleLinkData {
  required?: boolean;
  displayOrder?: number;
}

export async function getWordRules(projectId: string) {
  const { data } = await apiClient.get<{ items: WordRuleLink[] }>(
    `/projects/${projectId}/word-rules`,
  );
  return data;
}

export async function createWordRule(
  projectId: string,
  payload: CreateWordRuleLinkData,
) {
  const { data } = await apiClient.post<WordRuleLink>(
    `/projects/${projectId}/word-rules`,
    payload,
  );
  return data;
}

export async function updateWordRule(
  projectId: string,
  linkId: string,
  payload: UpdateWordRuleLinkData,
) {
  const { data } = await apiClient.patch<WordRuleLink>(
    `/projects/${projectId}/word-rules/${linkId}`,
    payload,
  );
  return data;
}

export async function deleteWordRule(projectId: string, linkId: string) {
  await apiClient.delete(`/projects/${projectId}/word-rules/${linkId}`);
}

export async function reorderWordRules(projectId: string, linkIds: string[]) {
  const { data } = await apiClient.put<{ success: true }>(
    `/projects/${projectId}/word-rules/order`,
    { linkIds },
  );
  return data;
}
