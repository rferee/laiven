import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Group,
  Stack,
  Text,
  Card,
  Alert,
  Tooltip,
  ActionIcon,
  Badge,
  Anchor,
  Accordion,
  Modal,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconTrash,
  IconAlertCircle,
  IconTransform,
  IconExternalLink,
  IconGripVertical,
} from '@tabler/icons-react';
import {
  getDerivativeTypes,
  linkApplicabilityRule,
  unlinkApplicabilityRule,
  reorderApplicabilityRules,
  type DerivativeType,
  type ApplicabilityRuleLink,
} from '@/api/derivative-types';
import { createRule, type CreateRuleData } from '@/api/rules';
import RulePickerModal from '@/components/RulePickerModal';
import SortableList from '@/components/SortableList';
import PageHeader from '@/components/PageHeader';
import SkeletonList from '@/components/SkeletonList';
import EmptyStateCard from '@/components/EmptyStateCard';

interface CreateFormValues {
  name: string;
  description: string;
}

export default function DerivativeRulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [pickerForDt, setPickerForDt] = useState<DerivativeType | null>(null);
  const [createForDt, setCreateForDt] = useState<DerivativeType | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<
    { dt: DerivativeType; link: ApplicabilityRuleLink } | null
  >(null);

  const createForm = useForm<CreateFormValues>({
    initialValues: { name: '', description: '' },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', projectId, 'derivative-types'],
    queryFn: () => getDerivativeTypes(projectId!),
    enabled: !!projectId,
  });

  const derivativeTypes = useMemo(() => data?.items ?? [], [data]);

  const defaultAccordion = useMemo(
    () => derivativeTypes.map((dt) => dt.id),
    [derivativeTypes],
  );

  const invalidateDt = () => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'derivative-types'] });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
  };

  const linkMutation = useMutation({
    mutationFn: ({ dtId, ruleId }: { dtId: string; ruleId: string }) =>
      linkApplicabilityRule(projectId!, dtId, { ruleId }),
    onSuccess: () => invalidateDt(),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ dtId, linkId }: { dtId: string; linkId: string }) =>
      unlinkApplicabilityRule(projectId!, dtId, linkId),
    onSuccess: () => {
      invalidateDt();
      setUnlinkTarget(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: ({ dtId, linkIds }: { dtId: string; linkIds: string[] }) =>
      reorderApplicabilityRules(projectId!, dtId, linkIds),
    onMutate: async ({ dtId, linkIds }) => {
      await queryClient.cancelQueries({ queryKey: ['projects', projectId, 'derivative-types'] });
      const previous = queryClient.getQueryData<{ items: DerivativeType[] }>([
        'projects',
        projectId,
        'derivative-types',
      ]);
      if (previous) {
        queryClient.setQueryData<{ items: DerivativeType[] }>(
          ['projects', projectId, 'derivative-types'],
          {
            items: previous.items.map((dt) => {
              if (dt.id !== dtId) return dt;
              const map = new Map(dt.applicabilityRules.map((l) => [l.id, l]));
              const reordered = linkIds
                .map((id, i) => {
                  const item = map.get(id);
                  return item ? { ...item, displayOrder: i } : null;
                })
                .filter((l): l is ApplicabilityRuleLink => l !== null);
              return { ...dt, applicabilityRules: reordered };
            }),
          },
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['projects', projectId, 'derivative-types'], ctx.previous);
      }
    },
    onSettled: () => invalidateDt(),
  });

  const createAndLinkMutation = useMutation({
    mutationFn: async ({
      dtId,
      payload,
    }: {
      dtId: string;
      payload: CreateRuleData;
    }) => {
      const created = await createRule(projectId!, payload);
      await linkApplicabilityRule(projectId!, dtId, { ruleId: created.id });
      return created;
    },
    onSuccess: (created) => {
      invalidateDt();
      setCreateForDt(null);
      createForm.reset();
      navigate(`/projects/${projectId}/rules/${created.id}/editor`);
    },
  });

  const handleReorder = (dtId: string, newIds: string[]) => {
    reorderMutation.mutate({ dtId, linkIds: newIds });
  };

  const handleCreate = (values: CreateFormValues) => {
    if (!createForDt) return;
    createAndLinkMutation.mutate({
      dtId: createForDt.id,
      payload: {
        name: values.name.trim(),
        description: values.description.trim() || null,
        graph: { nodes: [], edges: [] },
      },
    });
  };

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={18} />} color="red" title="Error loading derivative rules">
        {(error as Error).message}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconTransform size={28} stroke={1.5} />}
        title="Derivative Rules"
        description="Applicability rules that decide when derivative types apply."
      />

      {isLoading ? (
        <SkeletonList rows={2} height={96} />
      ) : derivativeTypes.length === 0 ? (
        <EmptyStateCard
          icon={<IconTransform size={48} stroke={1} color="var(--mantine-color-dimmed)" />}
          title="No derivative types defined"
          description="Create derivative types from the Configuration section before you can attach applicability rules."
          action={{
            label: 'Go to Derivative Types',
            icon: <IconPlus size={16} />,
            onClick: () => navigate(`/projects/${projectId}/derivative-types`),
          }}
        />
      ) : (
        <Accordion variant="separated" radius="md" multiple defaultValue={defaultAccordion}>
          {derivativeTypes.map((dt) => {
            const sorted = [...dt.applicabilityRules].sort(
              (a, b) => a.displayOrder - b.displayOrder,
            );
            return (
              <Accordion.Item key={dt.id} value={dt.id}>
                <Accordion.Control>
                  <Group gap="sm">
                    <Text fw={500}>{dt.name}</Text>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {dt.identifier}
                    </Text>
                    <Badge size="xs" variant="light" color="gray">
                      {sorted.length} rule{sorted.length !== 1 ? 's' : ''}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={6}>
                    {sorted.length === 0 ? (
                      <Text size="sm" c="dimmed" ta="center" py="sm">
                        No applicability rules -- this derivative applies to all words.
                      </Text>
                    ) : (
                      <SortableList
                        items={sorted}
                        onReorder={(newIds) => handleReorder(dt.id, newIds)}
                        renderItem={(link, isDragging, dragHandle) => (
                          <Card
                            withBorder
                            radius="sm"
                            p="xs"
                            style={{
                              backgroundColor: isDragging
                                ? 'var(--mantine-color-body)'
                                : undefined,
                            }}
                          >
                            <Group justify="space-between" wrap="nowrap" gap="sm">
                              <Group
                                gap="xs"
                                wrap="nowrap"
                                style={{ flex: 1, minWidth: 0 }}
                              >
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
                                    navigate(
                                      `/projects/${projectId}/rules/${link.ruleId}/editor`,
                                    )
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
                              </Group>
                              <Group gap="xs" wrap="nowrap">
                                <Tooltip label="Open in editor">
                                  <ActionIcon
                                    variant="subtle"
                                    size="sm"
                                    color="blue"
                                    onClick={() =>
                                      navigate(
                                        `/projects/${projectId}/rules/${link.ruleId}/editor`,
                                      )
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
                                    onClick={() => setUnlinkTarget({ dt, link })}
                                  >
                                    <IconTrash size={14} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            </Group>
                          </Card>
                        )}
                      />
                    )}
                    <Button
                      variant="light"
                      size="xs"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => setPickerForDt(dt)}
                      mt={4}
                    >
                      Add rule
                    </Button>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}

      <RulePickerModal
        opened={!!pickerForDt}
        onClose={() => setPickerForDt(null)}
        onPick={(ruleId) => {
          if (pickerForDt) {
            linkMutation.mutate({ dtId: pickerForDt.id, ruleId });
          }
        }}
        onCreateNew={() => {
          const dt = pickerForDt;
          setPickerForDt(null);
          if (dt) {
            createForm.reset();
            setCreateForDt(dt);
          }
        }}
        excludeRuleIds={pickerForDt?.applicabilityRules.map((l) => l.ruleId) ?? []}
        title={pickerForDt ? `Add applicability rule - ${pickerForDt.name}` : 'Add rule'}
      />

      {/* Inline create modal */}
      <Modal
        opened={!!createForDt}
        onClose={() => {
          setCreateForDt(null);
          createForm.reset();
        }}
        title={createForDt ? `Create rule for ${createForDt.name}` : 'Create rule'}
        size="md"
      >
        <form onSubmit={createForm.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Noun Check"
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
              The new rule will be added to the library and linked to this
              derivative type as an applicability rule.
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
                  setCreateForDt(null);
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
        title="Unlink applicability rule"
        size="sm"
      >
        <Stack gap="md">
          <Text>
            Remove{' '}
            <Text span fw={600}>
              {unlinkTarget?.link.ruleName}
            </Text>{' '}
            from <Text span fw={600}>{unlinkTarget?.dt.name}</Text>? The rule itself will
            remain in the library.
          </Text>
          {unlinkMutation.isError && (
            <Alert color="red" variant="light">
              {(unlinkMutation.error as Error).message}
            </Alert>
          )}
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setUnlinkTarget(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={unlinkMutation.isPending}
              onClick={() =>
                unlinkTarget &&
                unlinkMutation.mutate({
                  dtId: unlinkTarget.dt.id,
                  linkId: unlinkTarget.link.id,
                })
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
