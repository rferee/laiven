import apiClient from '@/api/client';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  role: 'instance_admin' | 'user';
  createdAt: string;
}

export interface CreateUserData {
  email: string;
  displayName: string;
  password: string;
  role?: 'instance_admin' | 'user';
}

export interface UpdateUserData {
  email?: string;
  displayName?: string;
  password?: string;
  role?: 'instance_admin' | 'user';
}

export async function getUsers(): Promise<{ items: UserRecord[]; nextCursor: string | null }> {
  const { data } = await apiClient.get('/users');
  return data;
}

export async function getUser(id: string): Promise<UserRecord> {
  const { data } = await apiClient.get(`/users/${id}`);
  return data;
}

export async function createUser(userData: CreateUserData): Promise<UserRecord> {
  const { data } = await apiClient.post('/users', userData);
  return data;
}

export async function updateUser(id: string, userData: UpdateUserData): Promise<UserRecord> {
  const { data } = await apiClient.patch(`/users/${id}`, userData);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}
