import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Card,
  TextInput,
  Textarea,
  Switch,
  Modal,
  ActionIcon,
  Alert,
  Table,
  Tooltip,
  Box,
  Divider,
  List,
  Checkbox,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconTrash,
  IconRuler,
  IconSearch,
  IconCheck,
  IconX,
} from '@tabler/icons-react';
import {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  type Rule,
  type CreateRuleData,
} from '@/api/rules';
import PageHeader from '@/components/PageHeader';
import SkeletonList from '@/components/SkeletonList';
import EmptyStateCard from '@/components/EmptyStateCard';
import LoadErrorAlert from '@/components/LoadErrorAlert';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import BulkSelectionToolbar from '@/components/BulkSelectionToolbar';

interface CreateFormValues {
  name: string;
  description: string;
}

export default function RulesLibraryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);
  // Retain the most recently-set delete target so the confirmation modal can
  // continue to show the rule name during its exit animation (after
  // `deleteTarget` has been cleared).
  const lastDeleteTargetRef = useRef<Rule | null>(null);
  useEffect(() => {
    if (deleteTarget) {
      lastDeleteTargetRef.current = deleteTarget;
    }
  }, [deleteTarget]);
  const deleteDisplayTarget = deleteTarget ?? lastDeleteTargetRef.current;
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: rulesData, isLoading, error } = useQuery({
    queryKey: ['projects', projectId, 'rules'],
    queryFn: () => getRules(projectId!),
    enabled: !!projectId,
  });

  const rules = rulesData?.items ?? [];

  const filteredRules = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rules;
    return rules.filter((r) => {
      const name = r.name.toLowerCase();
      const desc = (r.description ?? '').toLowerCase();
      return name.includes(needle) || desc.includes(needle);
    });
  }, [rules, search]);

  const createForm = useForm<CreateFormValues>({
    initialValues: { name: '', description: '' },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateRuleData) => createRule(projectId!, payload),
    onSuccess: (newRule) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
      closeCreate();
      createForm.reset();
      navigate(`/projects/${projectId}/rules/${newRule.id}/editor`);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateRule(projectId!, id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRule(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'word-rules'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'derivative-types'] });
      setDeleteTarget(null);
    },
  });

  const bulkToggleMutation = useMutation({
    mutationFn: async ({ ids, enabled }: { ids: string[]; enabled: boolean }) => {
      await Promise.all(
        ids.map((id) => updateRule(projectId!, id, { enabled })),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
      setSelectedIds(new Set());
    },
  });

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allFilteredSelected =
    filteredRules.length > 0 && filteredRules.every((r) => selectedIds.has(r.id));
  const someFilteredSelected =
    filteredRules.some((r) => selectedIds.has(r.id)) && !allFilteredSelected;

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const r of filteredRules) next.add(r.id);
      } else {
        for (const r of filteredRules) next.delete(r.id);
      }
      return next;
    });
  };

  const selectedCount = selectedIds.size;

  const handleCreate = (values: CreateFormValues) => {
    const payload: CreateRuleData = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      graph: { nodes: [], edges: [] },
    };
    createMutation.mutate(payload);
  };

  if (error) {
    return <LoadErrorAlert title="Error loading rules" error={error} />;
  }

  const deleteUsage = deleteDisplayTarget?.usage;
  const deleteHasUsage =
    !!deleteUsage?.asWordRule || (deleteUsage?.derivativeTypes?.length ?? 0) > 0;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconRuler size={28} stroke={1.5} />}
        title="Rules Library"
        description="Reusable validation rules used by words and derivative types."
        actions={
          <Button size="sm" leftSection={<IconPlus size={16} />} onClick={openCreate}>
            New Rule
          </Button>
        }
      />

      <TextInput
        placeholder="Search rules"
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />

      <BulkSelectionToolbar
        count={selectedCount}
        noun="rule"
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: `Enable ${selectedCount}`,
            color: 'green',
            icon: <IconCheck size={14} />,
            loading: bulkToggleMutation.isPending,
            onClick: () =>
              bulkToggleMutation.mutate({
                ids: Array.from(selectedIds),
                enabled: true,
              }),
          },
          {
            label: `Disable ${selectedCount}`,
            color: 'orange',
            icon: <IconX size={14} />,
            loading: bulkToggleMutation.isPending,
            onClick: () =>
              bulkToggleMutation.mutate({
                ids: Array.from(selectedIds),
                enabled: false,
              }),
          },
        ]}
      />


      {isLoading ? (
        <SkeletonList height={56} />
      ) : rules.length === 0 ? (
        <EmptyStateCard
          icon={<IconRuler size={48} stroke={1} color="var(--mantine-color-dimmed)" />}
          title="The rules library is empty"
          description="Rules are reusable node graphs that validate attribute values. Once created, link them to words or to derivative types as applicability rules."
          action={{
            label: 'Create your first rule',
            icon: <IconPlus size={16} />,
            onClick: openCreate,
          }}
        />
      ) : filteredRules.length === 0 ? (
        <Card withBorder radius="md" padding="md">
          <Text c="dimmed" size="sm" ta="center" py="md">
            No rules match your search.
          </Text>
        </Card>
      ) : (
        <Card withBorder radius="md" p={0}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={40}>
                  <Checkbox
                    aria-label="Select all rules"
                    checked={allFilteredSelected}
                    indeterminate={someFilteredSelected}
                    onChange={(e) => toggleSelectAll(e.currentTarget.checked)}
                  />
                </Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Usage</Table.Th>
                <Table.Th w={110}>Enabled</Table.Th>
                <Table.Th w={110} ta="right">Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filteredRules.map((rule) => {
                const asWord = rule.usage?.asWordRule ?? null;
                const derivatives = rule.usage?.derivativeTypes ?? [];
                const isSelected = selectedIds.has(rule.id);
                return (
                  <Table.Tr
                    key={rule.id}
                    bg={isSelected ? 'var(--mantine-color-blue-light)' : undefined}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/projects/${projectId}/rules/${rule.id}/editor`)}
                  >
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${rule.name}`}
                        checked={isSelected}
                        onChange={(e) =>
                          toggleSelectOne(rule.id, e.currentTarget.checked)
                        }
                      />
                    </Table.Td>
                    <Table.Td>
                      <Text fw={500} size="sm">
                        {rule.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" truncate maw={320}>
                        {rule.description || '--'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {asWord && (
                          <Tooltip label="Linked as a word rule">
                            <Badge size="xs" variant="light" color="blue">
                              Word - {asWord.required ? 'required' : 'optional'}
                            </Badge>
                          </Tooltip>
                        )}
                        {derivatives.map((dt) => (
                          <Tooltip key={dt.id} label={`Applicability rule for ${dt.name}`}>
                            <Badge size="xs" variant="light" color="atlantis">
                              {dt.name}
                            </Badge>
                          </Tooltip>
                        ))}
                        {!asWord && derivatives.length === 0 && (
                          <Text size="xs" c="dimmed">
                            Unused
                          </Text>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Tooltip label={rule.enabled ? 'Enabled - click to disable' : 'Disabled - click to enable'}>
                        <Box>
                          <Switch
                            size="sm"
                            checked={rule.enabled}
                            onChange={(e) =>
                              toggleMutation.mutate({
                                id: rule.id,
                                enabled: e.currentTarget.checked,
                              })
                            }
                          />
                        </Box>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Group gap={4} justify="flex-end">
                        <Tooltip label="Delete">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="red"
                            onClick={() => setDeleteTarget(rule)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
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
        title="Create rule"
        size="md"
        closeOnClickOutside={false}
      >
        <form onSubmit={createForm.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Vowel Harmony Check"
              withAsterisk
              autoFocus
              {...createForm.getInputProps('name')}
            />
            <Textarea
              label="Description"
              placeholder="Optional description"
              autosize
              minRows={2}
              {...createForm.getInputProps('description')}
            />
            <Text size="xs" c="dimmed">
              After creating, you will be taken to the node graph editor to
              define the validation logic. You can link this rule to words or
              derivative types from their respective pages.
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
                Create & open editor
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        target={deleteDisplayTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="Rule"
        extraContent={
          deleteHasUsage && deleteUsage ? (
            <>
              <Divider />
              <Alert color="sunset" variant="light" title="This rule is in use">
                <Stack gap={6}>
                  <Text size="sm">
                    Deleting it will unlink the rule from the following places:
                  </Text>
                  <List size="sm">
                    {deleteUsage.asWordRule && (
                      <List.Item>
                        Word rules (will be removed from this project's word validation)
                      </List.Item>
                    )}
                    {deleteUsage.derivativeTypes.map((dt) => (
                      <List.Item key={dt.id}>
                        Derivative type <b>{dt.name}</b> applicability
                      </List.Item>
                    ))}
                  </List>
                </Stack>
              </Alert>
            </>
          ) : null
        }
        mutation={deleteMutation}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </Stack>
  );
}
