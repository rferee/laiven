import apiClient from '@/api/client';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  role?: string;
}

export interface ProjectMember {
  userId: string;
  role: 'project_admin' | 'editor' | 'viewer';
  email: string;
  displayName: string;
  joinedAt: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
}

export interface AddMemberData {
  userId: string;
  role: 'project_admin' | 'editor' | 'viewer';
}

export async function getProjects(): Promise<{ items: Project[] }> {
  const { data } = await apiClient.get('/projects');
  return data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await apiClient.get(`/projects/${id}`);
  return data;
}

export async function createProject(projectData: CreateProjectData): Promise<Project> {
  const { data } = await apiClient.post('/projects', projectData);
  return data;
}

export async function updateProject(id: string, projectData: UpdateProjectData): Promise<Project> {
  const { data } = await apiClient.patch(`/projects/${id}`, projectData);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
}

export async function getProjectMembers(id: string): Promise<{ items: ProjectMember[] }> {
  const { data } = await apiClient.get(`/projects/${id}/members`);
  return data;
}

export async function addProjectMember(projectId: string, memberData: AddMemberData): Promise<ProjectMember> {
  const { data } = await apiClient.post(`/projects/${projectId}/members`, memberData);
  return data;
}

export async function updateMemberRole(
  projectId: string,
  userId: string,
  role: 'project_admin' | 'editor' | 'viewer',
): Promise<ProjectMember> {
  const { data } = await apiClient.patch(`/projects/${projectId}/members/${userId}`, { role });
  return data;
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/members/${userId}`);
}
