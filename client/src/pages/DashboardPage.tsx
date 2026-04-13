import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Container,
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
  Box,
  Divider,
  ActionIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconLanguage,
  IconArrowRight,
  IconLayoutDashboard,
} from '@tabler/icons-react';
import { getProjects, createProject, type CreateProjectData } from '@/api/projects';
import { searchWords } from '@/api/words';
import { useAuth } from '@/hooks/useAuth';
import { formatRelative } from '@/utils/format';
import PageHeader from '@/components/PageHeader';
import TopBar from '@/components/TopBar';
import EmptyStateCard from '@/components/EmptyStateCard';

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
      <TopBar />

      {/* Main content */}
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <PageHeader
            icon={<IconLayoutDashboard size={28} stroke={1.5} />}
            title="Projects"
            description="Select a language project to work on."
            actions={
              isAdmin ? (
                <Button
                  size="sm"
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setCreateModalOpen(true)}
                >
                  Create Project
                </Button>
              ) : undefined
            }
          />

          {isLoading ? (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} height={180} radius="md" />
              ))}
            </SimpleGrid>
          ) : projects.length === 0 ? (
            <EmptyStateCard
              icon={<IconLanguage size={48} stroke={1} color="var(--mantine-color-dimmed)" />}
              title="No projects yet"
              description={
                isAdmin
                  ? 'Create your first language project to get started.'
                  : 'Contact an administrator to get access to a project.'
              }
              action={
                isAdmin
                  ? {
                      label: 'Create your first project',
                      icon: <IconPlus size={16} />,
                      onClick: () => setCreateModalOpen(true),
                    }
                  : undefined
              }
            />
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
