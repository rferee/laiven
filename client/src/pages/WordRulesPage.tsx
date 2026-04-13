import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Title,
  Button,
  Group,
  Stack,
  Text,
  Card,
  Skeleton,
  Alert,
  Tooltip,
  ActionIcon,
  Switch,
  Badge,
  Box,
  Anchor,
  Modal,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconTrash,
  IconAlertCircle,
  IconAbc,
  IconExternalLink,
  IconGripVertical,
} from '@tabler/icons-react';
import {
  getWordRules,
  createWordRule,
  updateWordRule,
  deleteWordRule,
  reorderWordRules,
  type WordRuleLink,
} from '@/api/word-rules';
import { createRule, type CreateRuleData } from '@/api/rules';
import RulePickerModal from '@/components/RulePickerModal';
import SortableList from '@/components/SortableList';

interface CreateFormValues {
  name: string;
  description: string;
}

export default function WordRulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [unlinkTarget, setUnlinkTarget] = useState<WordRuleLink | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', projectId, 'word-rules'],
    queryFn: () => getWordRules(projectId!),
    enabled: !!projectId,
  });

  const links = useMemo(() => {
    const items = data?.items ?? [];
    return [...items].sort((a, b) => a.displayOrder - b.displayOrder);
  }, [data]);

  const linkMutation = useMutation({
    mutationFn: (ruleId: string) => createWordRule(projectId!, { ruleId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'word-rules'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ linkId, required }: { linkId: string; required: boolean }) =>
      updateWordRule(projectId!, linkId, { required }),
    onMutate: async ({ linkId, required }) => {
      await queryClient.cancelQueries({ queryKey: ['projects', projectId, 'word-rules'] });
      const previous = queryClient.getQueryData<{ items: WordRuleLink[] }>([
        'projects',
        projectId,
        'word-rules',
      ]);
      if (previous) {
        queryClient.setQueryData<{ items: WordRuleLink[] }>(
          ['projects', projectId, 'word-rules'],
          {
            items: previous.items.map((l) =>
              l.id === linkId ? { ...l, required } : l,
            ),
          },
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['projects', projectId, 'word-rules'], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'word-rules'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (linkId: string) => deleteWordRule(projectId!, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'word-rules'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
      setUnlinkTarget(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (linkIds: string[]) => reorderWordRules(projectId!, linkIds),
    onMutate: async (linkIds) => {
      await queryClient.cancelQueries({ queryKey: ['projects', projectId, 'word-rules'] });
      const previous = queryClient.getQueryData<{ items: WordRuleLink[] }>([
        'projects',
        projectId,
        'word-rules',
      ]);
      if (previous) {
        const map = new Map(previous.items.map((l) => [l.id, l]));
        const reordered: WordRuleLink[] = linkIds
          .map((id, i) => {
            const item = map.get(id);
            return item ? { ...item, displayOrder: i } : null;
          })
          .filter((l): l is WordRuleLink => l !== null);
        queryClient.setQueryData<{ items: WordRuleLink[] }>(
          ['projects', projectId, 'word-rules'],
          { items: reordered },
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['projects', projectId, 'word-rules'], ctx.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'word-rules'] });
    },
  });

  const createForm = useForm<CreateFormValues>({
    initialValues: { name: '', description: '' },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const createAndLinkMutation = useMutation({
    mutationFn: async (payload: CreateRuleData) => {
      const created = await createRule(projectId!, payload);
      await createWordRule(projectId!, { ruleId: created.id });
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'word-rules'] });
      closeCreate();
      createForm.reset();
      navigate(`/projects/${projectId}/rules/${created.id}/editor`);
    },
  });

  const handleReorder = (newIds: string[]) => {
    reorderMutation.mutate(newIds);
  };

  const handlePick = (ruleId: string) => {
    linkMutation.mutate(ruleId);
  };

  const handleOpenCreate = () => {
    createForm.reset();
    openCreate();
  };

  const handleCreate = (values: CreateFormValues) => {
    createAndLinkMutation.mutate({
      name: values.name.trim(),
      description: values.description.trim() || null,
      graph: { nodes: [], edges: [] },
    });
  };

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={18} />} color="red" title="Error loading word rules">
        {(error as Error).message}
      </Alert>
    );
  }

  const excludeRuleIds = links.map((l) => l.ruleId);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <IconAbc size={28} stroke={1.5} />
          <Stack gap={0}>
            <Title order={2}>Word Rules</Title>
            <Text size="sm" c="dimmed">
              Rules that validate every word in this project.
            </Text>
          </Stack>
        </Group>
        <Button leftSection={<IconPlus size={16} />} onClick={openPicker}>
          Add word rule
        </Button>
      </Group>

      {isLoading ? (
        <Stack gap={6}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={40} radius="md" />
          ))}
        </Stack>
      ) : links.length === 0 ? (
        <Card withBorder p="xl" radius="md">
          <Stack align="center" gap="sm" py="lg">
            <IconAbc size={48} stroke={1} color="var(--mantine-color-dimmed)" />
            <Text c="dimmed" size="lg" fw={500}>
              No word rules configured
            </Text>
            <Text c="dimmed" size="sm" ta="center" maw={420}>
              Add rules from the library to validate every word in this project.
            </Text>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openPicker} mt="sm">
              Add a word rule
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap={6}>
          <SortableList
            items={links}
            onReorder={handleReorder}
            renderItem={(link, isDragging, dragHandle) => (
              <Card
                withBorder
                radius="md"
                p="xs"
                style={{
                  backgroundColor: isDragging
                    ? 'var(--mantine-color-body)'
                    : undefined,
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      ref={dragHandle.ref}
                      {...dragHandle.attributes}
                      {...dragHandle.listeners}
                      style={dragHandle.style}
                      aria-label="Drag to reorder"
                    >
                      <IconGripVertical size={16} />
                    </ActionIcon>
                    <Anchor
                      size="sm"
                      fw={500}
                      onClick={() =>
                        navigate(`/projects/${projectId}/rules/${link.ruleId}/editor`)
                      }
                      style={{ minWidth: 0, flexShrink: 1 }}
                    >
                      <Text span truncate>
                        {link.ruleName}
                      </Text>
                    </Anchor>
                    {!link.ruleEnabled && (
                      <Badge size="xs" variant="light" color="gray">
                        Disabled
                      </Badge>
                    )}
                    {link.ruleDescription && (
                      <Text
                        size="xs"
                        c="dimmed"
                        truncate
                        style={{ minWidth: 0, flex: 1 }}
                      >
                        {link.ruleDescription}
                      </Text>
                    )}
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip
                      label={
                        link.required
                          ? 'Required - failure blocks save'
                          : 'Optional - failure shown as warning'
                      }
                    >
                      <Box>
                        <Switch
                          label="Required"
                          labelPosition="left"
                          size="xs"
                          checked={link.required}
                          onChange={(e) =>
                            patchMutation.mutate({
                              linkId: link.id,
                              required: e.currentTarget.checked,
                            })
                          }
                        />
                      </Box>
                    </Tooltip>
                    <Tooltip label="Open in editor">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="blue"
                        onClick={() =>
                          navigate(`/projects/${projectId}/rules/${link.ruleId}/editor`)
                        }
                      >
                        <IconExternalLink size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Unlink rule">
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        color="red"
                        onClick={() => setUnlinkTarget(link)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            )}
          />
        </Stack>
      )}

      <RulePickerModal
        opened={pickerOpened}
        onClose={closePicker}
        onPick={handlePick}
        onCreateNew={handleOpenCreate}
        excludeRuleIds={excludeRuleIds}
        title="Add word rule"
      />

      {/* Inline create modal */}
      <Modal
        opened={createOpened}
        onClose={() => {
          closeCreate();
          createForm.reset();
        }}
        title="Create and link rule"
        size="md"
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
              The new rule will be added to the library and linked as a word rule.
              You will be taken to the editor next.
            </Text>
            {createAndLinkMutation.isError && (
              <Alert color="red" variant="light">
                {(createAndLinkMutation.error as Error).message}
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
              <Button type="submit" loading={createAndLinkMutation.isPending}>
                Create & open editor
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Unlink confirmation */}
      <Modal
        opened={!!unlinkTarget}
        onClose={() => setUnlinkTarget(null)}
        title="Unlink rule"
        size="sm"
      >
        <Stack gap="md">
          <Text>
            Remove{' '}
            <Text span fw={600}>
              {unlinkTarget?.ruleName}
            </Text>{' '}
            from word rules? The rule itself will remain in the library.
          </Text>
          {deleteMutation.isError && (
            <Alert color="red" variant="light">
              {(deleteMutation.error as Error).message}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setUnlinkTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteMutation.isPending}
              onClick={() =>
                unlinkTarget && deleteMutation.mutate(unlinkTarget.id)
              }
            >
              Unlink
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
