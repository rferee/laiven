import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Group,
  Stack,
  Text,
  Card,
  TextInput,
  Modal,
  ActionIcon,
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
import PageHeader from '@/components/PageHeader';
import SkeletonList from '@/components/SkeletonList';
import EmptyStateCard from '@/components/EmptyStateCard';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';

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
      <PageHeader
        icon={<IconTransform size={28} stroke={1.5} />}
        title="Builders"
        description="Node graphs that programmatically generate derivative values from word attributes."
        actions={
          <Button size="sm" leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Add Builder
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonList height={52} />
      ) : builders.length === 0 ? (
        <EmptyStateCard
          icon={<IconTransform size={48} stroke={1} color="var(--mantine-color-dimmed)" />}
          title="No builders defined yet"
          description="Builders are node graphs that programmatically generate derivative values from word attributes."
          action={{
            label: 'Create your first builder',
            icon: <IconPlus size={16} />,
            onClick: openCreate,
          }}
        />
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
      <DeleteConfirmModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="Builder"
        warning={
          <Text size="sm">
            Derivative types referencing this builder will lose their generation logic.
          </Text>
        }
        mutation={deleteMutation}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </Stack>
  );
}
