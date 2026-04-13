import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Text,
  TextInput,
  Textarea,
  Button,
  Group,
  Stack,
  Card,
  Table,
  Badge,
  Select,
  Modal,
  ActionIcon,
  Alert,
  Skeleton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconTrash,
  IconAlertTriangle,
  IconUserPlus,
  IconCheck,
  IconSettings,
} from '@tabler/icons-react';
import {
  getProject,
  updateProject,
  deleteProject,
  getProjectMembers,
  addProjectMember,
  updateMemberRole,
  removeMember,
  type UpdateProjectData,
  type ProjectMember,
} from '@/api/projects';
import { getUsers, type UserRecord } from '@/api/users';
import { useAuth } from '@/hooks/useAuth';
import PageHeader from '@/components/PageHeader';
import SkeletonList from '@/components/SkeletonList';

const ROLE_OPTIONS = [
  { value: 'project_admin', label: 'Project Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

function roleBadgeColor(role: string) {
  switch (role) {
    case 'project_admin':
      return 'indigo';
    case 'editor':
      return 'teal';
    case 'viewer':
      return 'gray';
    default:
      return 'gray';
  }
}

function roleLabel(role: string) {
  switch (role) {
    case 'project_admin':
      return 'Admin';
    case 'editor':
      return 'Editor';
    case 'viewer':
      return 'Viewer';
    default:
      return role;
  }
}

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  // Fetch project details
  const {
    data: project,
    isLoading: projectLoading,
  } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  });

  // Fetch members
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['project', projectId, 'members'],
    queryFn: () => getProjectMembers(projectId!),
    enabled: !!projectId,
  });

  // Fetch users for "add member" modal
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: addMemberOpen,
  });

  // Project update form
  const projectForm = useForm<UpdateProjectData>({
    initialValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
    },
  });

  // Sync form when project loads. Must live in an effect — calling
  // `setValues` during render would trigger a setState-in-render warning
  // and risks an infinite render loop.
  useEffect(() => {
    if (project) {
      projectForm.setValues({
        name: project.name,
        description: project.description ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  // Add member form
  const addMemberForm = useForm({
    initialValues: {
      userId: '',
      role: 'editor' as ProjectMember['role'],
    },
    validate: {
      userId: (v) => (!v ? 'Select a user' : null),
    },
  });

  // Mutations
  const updateMutation = useMutation({
    mutationFn: (values: UpdateProjectData) => updateProject(projectId!, values),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({
        title: 'Saved',
        message: `Project "${updated.name}" updated.`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update project.',
        color: 'red',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteProject(projectId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      notifications.show({
        title: 'Project deleted',
        message: 'The project has been permanently deleted.',
        color: 'orange',
      });
      navigate('/');
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete project.',
        color: 'red',
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: (values: { userId: string; role: ProjectMember['role'] }) =>
      addProjectMember(projectId!, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'members'] });
      setAddMemberOpen(false);
      addMemberForm.reset();
      notifications.show({
        title: 'Member added',
        message: 'The user has been added to the project.',
        color: 'green',
      });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to add member.',
        color: 'red',
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectMember['role'] }) =>
      updateMemberRole(projectId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'members'] });
      notifications.show({
        title: 'Role updated',
        message: 'Member role has been changed.',
        color: 'green',
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => removeMember(projectId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId, 'members'] });
      notifications.show({
        title: 'Member removed',
        message: 'The member has been removed from the project.',
        color: 'orange',
      });
    },
  });

  const handleDeleteProject = () => {
    modals.openConfirmModal({
      title: 'Delete project',
      children: (
        <Stack gap="sm" mt="sm">
          <Text size="sm">
            Are you sure you want to delete <strong>{project?.name}</strong>?
          </Text>
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            This action cannot be undone. All words, configuration, rules, builders,
            and version history will be permanently deleted.
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Delete permanently', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        modals.openConfirmModal({
          title: 'Final confirmation',
          children: (
            <Stack gap="sm" mt="sm">
              <Text size="sm">
                This is your last chance. Deleting <strong>{project?.name}</strong> is
                irreversible.
              </Text>
              <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                All data will be permanently removed.
              </Alert>
            </Stack>
          ),
          labels: { confirm: 'Yes, delete', cancel: 'Go back' },
          confirmProps: { color: 'red' },
          onConfirm: () => deleteMutation.mutate(),
        });
      },
    });
  };

  const handleRemoveMember = (member: ProjectMember) => {
    modals.openConfirmModal({
      title: 'Remove member',
      children: (
        <Stack gap="sm">
          <Text size="sm">
            Remove <strong>{member.displayName}</strong> ({member.email}) from this project?
          </Text>
          <Alert color="sunset" variant="light" icon={<IconAlertTriangle size={16} />}>
            They will lose all access to this project.
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red', loading: removeMemberMutation.isPending },
      onConfirm: () => removeMemberMutation.mutate(member.userId),
    });
  };

  const members = membersData?.items ?? [];
  const allUsers = usersData?.items ?? [];
  const existingMemberIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u: UserRecord) => !existingMemberIds.has(u.id));
  const isAdmin = user?.role === 'instance_admin';

  const header = (
    <PageHeader
      icon={<IconSettings size={28} stroke={1.5} />}
      title="Project Settings"
      description="Manage project details, collaborators, and destructive actions."
    />
  );

  if (projectLoading) {
    return (
      <Stack gap="lg">
        {header}
        <Stack gap="sm">
          <Skeleton height={200} radius="md" />
          <Skeleton height={160} radius="md" />
        </Stack>
      </Stack>
    );
  }

  if (!project) {
    return (
      <Stack gap="lg">
        {header}
        <Card withBorder radius="md" padding="md">
          <Text c="dimmed" ta="center" py="lg">
            Project not found.
          </Text>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {header}

      {/* General Settings */}
      <Card withBorder radius="md" padding="md">
        <Stack gap="md">
          <Title order={4}>General</Title>
          <form
            onSubmit={projectForm.onSubmit((values) => updateMutation.mutate(values))}
          >
            <Stack gap="md">
              <TextInput
                label="Project Name"
                placeholder="Project name"
                required
                {...projectForm.getInputProps('name')}
              />
              <Textarea
                label="Description"
                placeholder="A brief description of your language"
                minRows={3}
                {...projectForm.getInputProps('description')}
              />
              <Group justify="flex-end">
                <Button type="submit" loading={updateMutation.isPending}>
                  Save Changes
                </Button>
              </Group>
            </Stack>
          </form>
        </Stack>
      </Card>

      {/* Members */}
      <Card withBorder radius="md" padding="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Members</Title>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconUserPlus size={14} />}
              onClick={() => setAddMemberOpen(true)}
            >
              Add Member
            </Button>
          </Group>

          {membersLoading ? (
            <SkeletonList height={44} />
          ) : members.length === 0 ? (
            <Text c="dimmed" size="sm" ta="center" py="md">
              No members yet. Add someone to collaborate on this project.
            </Text>
          ) : (
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>User</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th w={80}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {members.map((member) => (
                  <Table.Tr key={member.userId}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {member.displayName}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {member.email}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {member.userId === user?.id ? (
                        <Badge color={roleBadgeColor(member.role)} variant="light" size="sm">
                          {roleLabel(member.role)}
                        </Badge>
                      ) : (
                        <Select
                          size="xs"
                          w={150}
                          data={ROLE_OPTIONS}
                          value={member.role}
                          onChange={(value) => {
                            if (value && value !== member.role) {
                              updateRoleMutation.mutate({
                                userId: member.userId,
                                role: value as ProjectMember['role'],
                              });
                            }
                          }}
                        />
                      )}
                    </Table.Td>
                    <Table.Td>
                      {member.userId !== user?.id && (
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => handleRemoveMember(member)}
                          title="Remove member"
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>

      {/* Danger Zone */}
      {isAdmin && (
        <Card withBorder radius="md" padding="md" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
          <Stack gap="md">
            <Title order={4} c="red">
              Danger Zone
            </Title>
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={16} />}
            >
              Deleting a project permanently removes all words, configuration, rules,
              builders, and version history. This cannot be undone.
            </Alert>
            <Button
              color="red"
              variant="outline"
              leftSection={<IconTrash size={16} />}
              onClick={handleDeleteProject}
              loading={deleteMutation.isPending}
              style={{ alignSelf: 'flex-end' }}
            >
              Delete Project
            </Button>
          </Stack>
        </Card>
      )}

      {/* Add Member Modal */}
      <Modal
        opened={addMemberOpen}
        onClose={() => {
          setAddMemberOpen(false);
          addMemberForm.reset();
        }}
        title="Add Member"
        centered
        closeOnClickOutside={false}
      >
        <form
          onSubmit={addMemberForm.onSubmit((values) =>
            addMemberMutation.mutate(values),
          )}
        >
          <Stack gap="md">
            <Select
              label="User"
              placeholder="Select a user"
              data={availableUsers.map((u: UserRecord) => ({
                value: u.id,
                label: `${u.displayName} (${u.email})`,
              }))}
              searchable
              required
              {...addMemberForm.getInputProps('userId')}
            />
            <Select
              label="Role"
              data={ROLE_OPTIONS}
              required
              {...addMemberForm.getInputProps('role')}
            />
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  setAddMemberOpen(false);
                  addMemberForm.reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={addMemberMutation.isPending}>
                Add
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
