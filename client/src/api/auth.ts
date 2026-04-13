import apiClient from '@/api/client';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'instance_admin' | 'user';
}

export interface SetupStatus {
  needsSetup: boolean;
}

export interface SetupData {
  email: string;
  displayName: string;
  password: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  projectId: string | null;
  role: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ApiKeyCreateResponse extends ApiKey {
  key: string;
}

export interface CreateApiKeyData {
  name: string;
  projectId?: string;
  role?: string;
}

export async function checkSetupStatus(): Promise<SetupStatus> {
  const { data } = await apiClient.get('/auth/setup-status');
  return data;
}

export async function setup(setupData: SetupData): Promise<User> {
  const { data } = await apiClient.post('/auth/setup', setupData);
  return data;
}

export async function login(email: string, password: string): Promise<User> {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function getMe(): Promise<User> {
  const { data } = await apiClient.get('/auth/me');
  return data;
}

export async function getApiKeys(): Promise<ApiKey[]> {
  const { data } = await apiClient.get('/auth/api-keys');
  return data;
}

export async function createApiKey(keyData: CreateApiKeyData): Promise<ApiKeyCreateResponse> {
  const { data } = await apiClient.post('/auth/api-keys', keyData);
  return data;
}

export async function deleteApiKey(id: string): Promise<void> {
  await apiClient.delete(`/auth/api-keys/${id}`);
}

export async function updateProfile(data: {
  displayName?: string;
  currentPassword?: string;
  newPassword?: string;
}): Promise<User> {
  const { data: result } = await apiClient.patch('/auth/profile', data);
  return result;
}
