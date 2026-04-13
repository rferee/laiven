import apiClient from '@/api/client';

export interface WordValidateRequest {
  attributeValues: Record<string, unknown>;
  excludeWordId?: string;
}

export interface WordValidationError {
  ruleId?: string;
  ruleName: string;
  message?: string;
  required: boolean;
  touchedAttributes: string[];
  attributeId?: string;
}

export interface WordValidationRuleResult {
  ruleId: string;
  ruleName: string;
  pass: boolean;
  required: boolean;
  message?: string;
  touchedAttributes: string[];
}

export interface WordValidationResponse {
  valid: boolean;
  errors: WordValidationError[];
  warnings: WordValidationError[];
  ruleResults: WordValidationRuleResult[];
}

/**
 * Run live validation for a word without persisting anything. The request can
 * be cancelled by aborting the supplied signal, which is essential when the
 * caller debounces attribute edits and wants to discard stale responses.
 */
export async function validateWordLive(
  projectId: string,
  body: WordValidateRequest,
  signal?: AbortSignal,
): Promise<WordValidationResponse> {
  const { data } = await apiClient.post<WordValidationResponse>(
    `/projects/${projectId}/words/validate`,
    body,
    { signal },
  );
  return data;
}
