import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Container,
  Title,
  Text,
  SimpleGrid,
  Card,
  Group,
  Badge,
  Button,
  Modal,
  TextInput,
  Textarea,
  Stack,
  Skeleton,
  Menu,
  Avatar,
  UnstyledButton,
  Box,
  Flex,
  Divider,
  ActionIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconChevronDown,
  IconUser,
  IconUsers,
  IconLogout,
  IconLanguage,
  IconArrowRight,
  IconLayoutDashboard,
} from '@tabler/icons-react';
import { getProjects, createProject, type CreateProjectData } from '@/api/projects';
import { searchWords } from '@/api/words';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { formatRelative } from '@/utils/format';

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const projectsList = data?.items ?? [];

  // Fetch a cheap word count per project in parallel. The search endpoint
  // returns `{ items, nextCursor, total }`, so limit=1 is enough to read total.
  const wordCountQueries = useQueries({
    queries: projectsList.map((p) => ({
      queryKey: ['projects', p.id, 'word-count'],
      queryFn: () => searchWords(p.id, { limit: 1 }),
      enabled: !!p.id,
      staleTime: 30_000,
    })),
  });

  const createMutation = useMutation({
    mutationFn: (values: CreateProjectData) => createProject(values),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setCreateModalOpen(false);
      createForm.reset();
      notifications.show({
        title: 'Project created',
        message: `"${project.name}" has been created successfully.`,
        color: 'green',
      });
      navigate(`/projects/${project.id}`);
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to create project. Please try again.',
        color: 'red',
      });
    },
  });

  const logoutMutation = useLogout();

  const createForm = useForm<CreateProjectData>({
    initialValues: {
      name: '',
      description: '',
    },
    validate: {
      name: (v) => (v.trim().length < 1 ? 'Name is required' : null),
    },
  });

  const projects = projectsList;
  const isAdmin = user?.role === 'instance_admin';

  return (
    <Box mih="100vh" bg="var(--mantine-color-body)">
      {/* Header */}
      <Box
        component="header"
        py="sm"
        px="lg"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
        }}
      >
        <Flex justify="space-between" align="center">
          <Group gap="xs">
            <IconLanguage size={22} stroke={1.5} color="var(--mantine-color-atlantis-5)" />
            <Title order={4} fw={700}>
              Laiven
            </Title>
          </Group>

          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap="xs">
                  <Avatar size="sm" radius="xl" color="atlantis">
                    {user?.displayName?.charAt(0).toUpperCase() ?? 'U'}
                  </Avatar>
                  <Text size="sm" fw={500}>
                    {user?.displayName ?? 'User'}
                  </Text>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>Account</Menu.Label>
              <Menu.Item
                leftSection={<IconLayoutDashboard size={14} />}
                onClick={() => navigate('/')}
              >
                Dashboard
              </Menu.Item>
              <Menu.Item
                leftSection={<IconUser size={14} />}
                onClick={() => navigate('/profile')}
              >
                Profile
              </Menu.Item>
              {user?.role === 'instance_admin' && (
                <Menu.Item
                  leftSection={<IconUsers size={14} />}
                  onClick={() => navigate('/users')}
                >
                  User Management
                </Menu.Item>
              )}
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={14} />}
                onClick={() => logoutMutation.mutate()}
              >
                Logout
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Flex>
      </Box>

      {/* Main content */}
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <IconLayoutDashboard size={28} stroke={1.5} />
              <Title order={2}>Projects</Title>
            </Group>
            {isAdmin && (
              <Button
                size="sm"
                leftSection={<IconPlus size={16} />}
                onClick={() => setCreateModalOpen(true)}
              >
                Create Project
              </Button>
            )}
          </Group>
          <Text c="dimmed" size="sm">
            Select a language project to work on.
          </Text>

          {isLoading ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={180} radius="md" />
              ))}
            </SimpleGrid>
          ) : projects.length === 0 ? (
            <Card withBorder radius="md" padding="md">
              <Stack align="center" gap="sm" py="lg">
                <IconLanguage size={48} stroke={1} color="var(--mantine-color-dimmed)" />
                <Text c="dimmed" size="lg" fw={500}>
                  No projects yet
                </Text>
                <Text c="dimmed" size="sm" ta="center">
                  {isAdmin
                    ? 'Create your first language project to get started.'
                    : 'Contact an administrator to get access to a project.'}
                </Text>
                {isAdmin && (
                  <Button
                    variant="light"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setCreateModalOpen(true)}
                  >
                    Create your first project
                  </Button>
                )}
              </Stack>
            </Card>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {projects.map((project, index) => {
                const wordCountQuery = wordCountQueries[index];
                const wordCount = wordCountQuery?.data?.total;
                return (
                  <Card
                    key={project.id}
                    withBorder
                    radius="md"
                    padding="md"
                    style={{ cursor: 'pointer', transition: 'background-color 120ms ease' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#191c20';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '';
                    }}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <Stack gap="xs">
                      <Group justify="space-between" wrap="nowrap">
                        <Text fw={600} size="lg" lineClamp={1}>
                          {project.name}
                        </Text>
                        {project.role && (
                          <Badge
                            variant="light"
                            color={
                              project.role === 'project_admin'
                                ? 'atlantis'
                                : project.role === 'editor'
                                  ? 'atlantis'
                                  : 'gray'
                            }
                            size="sm"
                          >
                            {project.role === 'project_admin'
                              ? 'Admin'
                              : project.role === 'editor'
                                ? 'Editor'
                                : 'Viewer'}
                          </Badge>
                        )}
                      </Group>

                      <Text size="sm" c="dimmed" lineClamp={2} mih={40}>
                        {project.description || 'No description'}
                      </Text>

                      <Divider />

                      <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                          <Text size="xs" c="dimmed">
                            Updated {formatRelative(project.updatedAt)}
                          </Text>
                          {typeof wordCount === 'number' && (
                            <>
                              <Text size="xs" c="dimmed">
                                •
                              </Text>
                              <Text size="xs" c="dimmed">
                                {wordCount} word{wordCount === 1 ? '' : 's'}
                              </Text>
                            </>
                          )}
                        </Group>
                        <ActionIcon variant="subtle" color="atlantis" size="sm">
                          <IconArrowRight size={16} />
                        </ActionIcon>
                      </Group>
                    </Stack>
                  </Card>
                );
              })}
            </SimpleGrid>
          )}
        </Stack>
      </Container>

      {/* Create Project Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          createForm.reset();
        }}
        title="Create New Project"
        centered
        closeOnClickOutside={false}
      >
        <form
          onSubmit={createForm.onSubmit((values) => createMutation.mutate(values))}
          noValidate
        >
          <Stack gap="md">
            <TextInput
              label="Project Name"
              placeholder="e.g. Elvish, Klingon, Thalassian"
              withAsterisk
              data-autofocus
              autoFocus
              {...createForm.getInputProps('name')}
            />
            <Textarea
              label="Description"
              placeholder="A brief description of your constructed language"
              minRows={3}
              {...createForm.getInputProps('description')}
            />
            <Text size="xs" c="dimmed">
              You can configure attributes, rules, and builders after the project is
              created.
            </Text>
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => {
                  setCreateModalOpen(false);
                  createForm.reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
