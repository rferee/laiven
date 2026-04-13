import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Title,
  Button,
  Group,
  Stack,
  Text,
  Card,
  TextInput,
  Modal,
  ActionIcon,
  Skeleton,
  Alert,
  Table,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconTrash,
  IconAlertCircle,
  IconTransform,
  IconExternalLink,
} from '@tabler/icons-react';
import {
  getBuilders,
  createBuilder,
  deleteBuilder,
  type Builder,
  type CreateBuilderData,
} from '@/api/builders';
import { formatDate } from '@/utils/format';

interface CreateFormValues {
  name: string;
}

export default function BuildersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<Builder | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', projectId, 'builders'],
    queryFn: () => getBuilders(projectId!),
    enabled: !!projectId,
  });

  const builders = data?.items ?? [];

  const createForm = useForm<CreateFormValues>({
    initialValues: {
      name: '',
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateBuilderData) => createBuilder(projectId!, payload),
    onSuccess: (newBuilder) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'builders'] });
      closeCreate();
      createForm.reset();
      navigate(`/projects/${projectId}/builders/${newBuilder.id}/editor`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBuilder(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'builders'] });
      setDeleteTarget(null);
    },
  });

  const handleCreate = (values: CreateFormValues) => {
    const payload: CreateBuilderData = {
      name: values.name,
      graph: { nodes: [], edges: [] },
    };
    createMutation.mutate(payload);
  };

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={18} />} color="red" title="Error loading builders">
        {(error as Error).message}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <IconTransform size={28} stroke={1.5} />
          <Title order={2}>Builders</Title>
        </Group>
        <Button size="sm" leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Add Builder
        </Button>
      </Group>
      <Text c="dimmed" size="sm">
        Node graphs that programmatically generate derivative values from word attributes.
      </Text>

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={52} radius="md" />
          ))}
        </Stack>
      ) : builders.length === 0 ? (
        <Card withBorder radius="md" padding="md">
          <Stack align="center" gap="sm" py="lg">
            <IconTransform size={48} stroke={1} color="var(--mantine-color-dimmed)" />
            <Text c="dimmed" size="lg" fw={500}>
              No builders defined yet
            </Text>
            <Text c="dimmed" size="sm">
              Builders are node graphs that programmatically generate derivative values from word attributes.
            </Text>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Create your first builder
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card withBorder radius="md" p={0}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th w={100} ta="right">
                  Actions
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {builders.map((builder) => (
                <Table.Tr
                  key={builder.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() =>
                    navigate(`/projects/${projectId}/builders/${builder.id}/editor`)
                  }
                >
                  <Table.Td>
                    <Text fw={500} size="sm">
                      {builder.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {formatDate(builder.createdAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end" onClick={(e) => e.stopPropagation()}>
                      <Tooltip label="Open in editor">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="blue"
                          onClick={() =>
                            navigate(`/projects/${projectId}/builders/${builder.id}/editor`)
                          }
                        >
                          <IconExternalLink size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          color="red"
                          onClick={() => setDeleteTarget(builder)}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      {/* Create Modal */}
      <Modal
        opened={createOpened}
        onClose={() => {
          closeCreate();
          createForm.reset();
        }}
        title="Add Builder"
        size="md"
        closeOnClickOutside={false}
      >
        <form onSubmit={createForm.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Past Tense Builder, Plural Form Builder"
              withAsterisk
              autoFocus
              {...createForm.getInputProps('name')}
            />
            <Text size="xs" c="dimmed">
              After creating, you will be taken to the node graph editor to define the generation logic.
            </Text>
            {createMutation.isError && (
              <Alert color="red" variant="light">
                {(createMutation.error as Error).message}
              </Alert>
            )}
            <Group justify="flex-end" gap="sm">
              <Button
                variant="default"
                onClick={() => {
                  closeCreate();
                  createForm.reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create & Open Editor
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Builder"
        size="sm"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete{' '}
            <Text span fw={600}>
              {deleteTarget?.name}
            </Text>
            ?
          </Text>
          <Alert color="sunset" variant="light" icon={<IconAlertCircle size={16} />}>
            Derivative types referencing this builder will lose their generation logic.
          </Alert>
          {deleteMutation.isError && (
            <Alert color="red" variant="light">
              {(deleteMutation.error as Error).message}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
