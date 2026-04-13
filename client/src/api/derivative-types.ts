import apiClient from '@/api/client';

export interface DerivativeTypeDependency {
  derivativeTypeId: string;
  derivativeTypeName: string;
}

/**
 * A link between a derivative type and a library rule used for applicability.
 * `id` is the link id (not the rule id). The rule itself lives in the rules library.
 */
export interface ApplicabilityRuleLink {
  id: string;
  ruleId: string;
  ruleName: string;
  required: boolean;
  displayOrder: number;
  ruleEnabled: boolean;
}

export interface DerivativeType {
  id: string;
  projectId: string;
  name: string;
  identifier: string;
  required: boolean;
  builderId?: string;
  builderName?: string;
  applicabilityRules: ApplicabilityRuleLink[];
  dependencies: DerivativeTypeDependency[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDerivativeTypeData {
  name: string;
  identifier: string;
  required?: boolean;
  builderId?: string;
  dependencies?: string[];
}

export interface UpdateDerivativeTypeData {
  name?: string;
  required?: boolean;
  builderId?: string;
  dependencies?: string[];
}

export interface DerivativeTypeVersion {
  id: string;
  entityId: string;
  versionNumber: number;
  changeType: 'created' | 'updated' | 'deleted';
  snapshot: DerivativeType;
  userId: string;
  userName: string;
  createdAt: string;
}

export async function getDerivativeTypes(projectId: string) {
  const { data } = await apiClient.get<{ items: DerivativeType[] }>(
    `/projects/${projectId}/derivative-types`,
  );
  return data;
}

export async function createDerivativeType(
  projectId: string,
  payload: CreateDerivativeTypeData,
) {
  const { data } = await apiClient.post<DerivativeType>(
    `/projects/${projectId}/derivative-types`,
    payload,
  );
  return data;
}

export async function getDerivativeType(projectId: string, id: string) {
  const { data } = await apiClient.get<DerivativeType>(
    `/projects/${projectId}/derivative-types/${id}`,
  );
  return data;
}

export async function updateDerivativeType(
  projectId: string,
  id: string,
  payload: UpdateDerivativeTypeData,
) {
  const { data } = await apiClient.put<DerivativeType>(
    `/projects/${projectId}/derivative-types/${id}`,
    payload,
  );
  return data;
}

export async function deleteDerivativeType(projectId: string, id: string) {
  await apiClient.delete(`/projects/${projectId}/derivative-types/${id}`);
}

export async function getDerivativeTypeVersions(projectId: string, id: string) {
  const { data } = await apiClient.get<{ items: DerivativeTypeVersion[] }>(
    `/projects/${projectId}/derivative-types/${id}/versions`,
  );
  return data;
}

export async function getApplicabilityRules(projectId: string, dtId: string) {
  const { data } = await apiClient.get<{ items: ApplicabilityRuleLink[] }>(
    `/projects/${projectId}/derivative-types/${dtId}/applicability-rules`,
  );
  return data;
}

export async function linkApplicabilityRule(
  projectId: string,
  dtId: string,
  payload: { ruleId: string; required?: boolean; displayOrder?: number },
) {
  const { data } = await apiClient.post<ApplicabilityRuleLink>(
    `/projects/${projectId}/derivative-types/${dtId}/applicability-rules`,
    payload,
  );
  return data;
}

export async function updateApplicabilityRuleLink(
  projectId: string,
  dtId: string,
  linkId: string,
  payload: { required?: boolean; displayOrder?: number },
) {
  const { data } = await apiClient.patch<ApplicabilityRuleLink>(
    `/projects/${projectId}/derivative-types/${dtId}/applicability-rules/${linkId}`,
    payload,
  );
  return data;
}

export async function unlinkApplicabilityRule(
  projectId: string,
  dtId: string,
  linkId: string,
) {
  await apiClient.delete(
    `/projects/${projectId}/derivative-types/${dtId}/applicability-rules/${linkId}`,
  );
}

export async function reorderApplicabilityRules(
  projectId: string,
  dtId: string,
  linkIds: string[],
) {
  const { data } = await apiClient.put<{ success: true }>(
    `/projects/${projectId}/derivative-types/${dtId}/applicability-rules/order`,
    { linkIds },
  );
  return data;
}
