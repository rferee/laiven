import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Title,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Card,
  TextInput,
  Textarea,
  Select,
  Switch,
  MultiSelect,
  Modal,
  ActionIcon,
  Skeleton,
  Alert,
  Table,
  Tooltip,
  Anchor,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconAlertCircle,
  IconGitBranch,
  IconLink,
} from '@tabler/icons-react';
import {
  getDerivativeTypes,
  createDerivativeType,
  updateDerivativeType,
  deleteDerivativeType,
  linkApplicabilityRule,
  unlinkApplicabilityRule,
  type DerivativeType,
  type CreateDerivativeTypeData,
  type UpdateDerivativeTypeData,
} from '@/api/derivative-types';
import { getBuilders, type Builder } from '@/api/builders';
import { createRule, type CreateRuleData } from '@/api/rules';
import RulePickerModal from '@/components/RulePickerModal';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

interface FormValues {
  name: string;
  identifier: string;
  required: boolean;
  builderId: string;
  dependencies: string[];
}

interface RuleCreateFormValues {
  name: string;
  description: string;
}

function handleNameChange(value: string, form: ReturnType<typeof useForm<FormValues>>, isCreate: boolean) {
  form.setFieldValue('name', value);
  if (isCreate) {
    form.setFieldValue('identifier', slugify(value));
  }
}

interface DerivativeTypeFormProps {
  form: ReturnType<typeof useForm<FormValues>>;
  onSubmit: (values: FormValues) => void;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string;
  onCancel: () => void;
  submitLabel: string;
  isCreate: boolean;
  excludeId?: string;
  derivativeTypes: DerivativeType[];
  builderOptions: { value: string; label: string }[];
}

function DerivativeTypeForm({
  form,
  onSubmit,
  isPending,
  isError,
  errorMessage,
  onCancel,
  submitLabel,
  isCreate,
  excludeId,
  derivativeTypes,
  builderOptions,
}: DerivativeTypeFormProps) {
  const dependencyOptions = derivativeTypes
    .filter((dt) => dt.id !== excludeId)
    .map((dt) => ({ value: dt.id, label: dt.name }));

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="e.g. Past Tense, Plural, Diminutive"
          withAsterisk
          autoFocus
          value={form.values.name}
          onChange={(e) => handleNameChange(e.currentTarget.value, form, isCreate)}
          error={form.errors.name}
        />
        <TextInput
          label="Identifier"
          placeholder="machine_friendly_slug"
          withAsterisk
          description="Machine-friendly slug used in rules and builders"
          {...form.getInputProps('identifier')}
        />
        <Switch
          label="Required"
          description="If enabled, applicable words must have a value for this derivative"
          checked={form.values.required}
          onChange={(e) => form.setFieldValue('required', e.currentTarget.checked)}
        />
        <Select
          label="Builder"
          description="The node graph that generates this derivative value"
          data={builderOptions}
          clearable
          searchable
          {...form.getInputProps('builderId')}
        />
        <MultiSelect
          label="Dependencies"
          description="Other derivative types that must be computed before this one"
          data={dependencyOptions}
          searchable
          clearable
          {...form.getInputProps('dependencies')}
        />
        {isError && (
          <Alert color="red" variant="light">
            {errorMessage}
          </Alert>
        )}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export default function DerivativeTypesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [editTarget, setEditTarget] = useState<DerivativeType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DerivativeType | null>(null);
  const [pickerForDt, setPickerForDt] = useState<DerivativeType | null>(null);
  const [createRuleForDt, setCreateRuleForDt] = useState<DerivativeType | null>(null);
  const ruleCreateForm = useForm<RuleCreateFormValues>({
    initialValues: { name: '', description: '' },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const { data: typesData, isLoading: typesLoading, error: typesError } = useQuery({
    queryKey: ['projects', projectId, 'derivative-types'],
    queryFn: () => getDerivativeTypes(projectId!),
    enabled: !!projectId,
  });

  const { data: buildersData } = useQuery({
    queryKey: ['projects', projectId, 'builders'],
    queryFn: () => getBuilders(projectId!),
    enabled: !!projectId,
  });

  const derivativeTypes = typesData?.items ?? [];
  const builders = buildersData?.items ?? [];

  const builderOptions = [
    { value: '', label: 'None (no auto-generation)' },
    ...builders.map((b) => ({ value: b.id, label: b.name })),
  ];

  const builderMap = new Map<string, Builder>();
  for (const b of builders) {
    builderMap.set(b.id, b);
  }

  const createForm = useForm<FormValues>({
    initialValues: {
      name: '',
      identifier: '',
      required: false,
      builderId: '',
      dependencies: [],
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
      identifier: (v) => (!v.trim() ? 'Identifier is required' : null),
    },
  });

  const editForm = useForm<FormValues>({
    initialValues: {
      name: '',
      identifier: '',
      required: false,
      builderId: '',
      dependencies: [],
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
      identifier: (v) => (!v.trim() ? 'Identifier is required' : null),
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateDerivativeTypeData) =>
      createDerivativeType(projectId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'derivative-types'] });
      closeCreate();
      createForm.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateDerivativeTypeData }) =>
      updateDerivativeType(projectId!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'derivative-types'] });
      setEditTarget(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDerivativeType(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'derivative-types'] });
      setDeleteTarget(null);
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'derivative-types'] });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'rules'] });
  };

  const linkRuleMutation = useMutation({
    mutationFn: ({ dtId, ruleId }: { dtId: string; ruleId: string }) =>
      linkApplicabilityRule(projectId!, dtId, { ruleId }),
    onSuccess: () => invalidateAll(),
  });

  const unlinkRuleMutation = useMutation({
    mutationFn: ({ dtId, linkId }: { dtId: string; linkId: string }) =>
      unlinkApplicabilityRule(projectId!, dtId, linkId),
    onSuccess: () => invalidateAll(),
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
      invalidateAll();
      setCreateRuleForDt(null);
      ruleCreateForm.reset();
      navigate(`/projects/${projectId}/rules/${created.id}/editor`);
    },
  });

  const handleCreateAndLinkRule = (values: RuleCreateFormValues) => {
    if (!createRuleForDt) return;
    createAndLinkMutation.mutate({
      dtId: createRuleForDt.id,
      payload: {
        name: values.name.trim(),
        description: values.description.trim() || null,
        graph: { nodes: [], edges: [] },
      },
    });
  };

  const handleCreate = (values: FormValues) => {
    const payload: CreateDerivativeTypeData = {
      name: values.name,
      identifier: values.identifier,
      required: values.required,
      builderId: values.builderId || undefined,
      dependencies: values.dependencies.length > 0 ? values.dependencies : undefined,
    };
    createMutation.mutate(payload);
  };

  const handleEdit = (values: FormValues) => {
    if (!editTarget) return;
    const payload: UpdateDerivativeTypeData = {
      name: values.name,
      required: values.required,
      builderId: values.builderId || undefined,
      dependencies: values.dependencies.length > 0 ? values.dependencies : undefined,
    };
    updateMutation.mutate({ id: editTarget.id, payload });
  };

  const handleOpenEdit = (dt: DerivativeType) => {
    setEditTarget(dt);
    editForm.setValues({
      name: dt.name,
      identifier: dt.identifier,
      required: dt.required,
      builderId: dt.builderId ?? '',
      dependencies: dt.dependencies.map((d) => d.derivativeTypeId),
    });
  };

  if (typesError) {
    return (
      <Alert icon={<IconAlertCircle size={18} />} color="red" title="Error loading derivative types">
        {(typesError as Error).message}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <IconGitBranch size={28} stroke={1.5} />
          <Title order={2}>Derivative Types</Title>
        </Group>
        <Button size="sm" leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Add Derivative Type
        </Button>
      </Group>
      <Text c="dimmed" size="sm">
        Derived word forms (e.g. past tense, plural) that are auto-generated by builders.
      </Text>

      {typesLoading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={52} radius="md" />
          ))}
        </Stack>
      ) : derivativeTypes.length === 0 ? (
        <Card withBorder radius="md" padding="md">
          <Stack align="center" gap="sm" py="lg">
            <IconGitBranch size={48} stroke={1} color="var(--mantine-color-dimmed)" />
            <Text c="dimmed" size="lg" fw={500}>
              No derivative types defined yet
            </Text>
            <Text c="dimmed" size="sm">
              Derivative types define derived word forms (e.g. past tense, plural, diminutive) that are auto-generated by builders.
            </Text>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Create your first derivative type
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card withBorder radius="md" p={0}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Identifier</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Builder</Table.Th>
                <Table.Th>Dependencies</Table.Th>
                <Table.Th>Applicability Rules</Table.Th>
                <Table.Th w={100} ta="right">
                  Actions
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {derivativeTypes.map((dt) => {
                const builder = dt.builderId ? builderMap.get(dt.builderId) : null;
                const applicabilityRules = dt.applicabilityRules ?? [];

                return (
                  <Table.Tr key={dt.id}>
                    <Table.Td>
                      <Text fw={500} size="sm">
                        {dt.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed" ff="monospace">
                        {dt.identifier}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {dt.required ? (
                        <Badge size="sm" variant="dot" color="red">
                          Required
                        </Badge>
                      ) : (
                        <Badge size="sm" variant="dot" color="gray">
                          Optional
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {builder ? (
                        <Anchor
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                              `/projects/${projectId}/builders/${builder.id}/editor`,
                            );
                          }}
                        >
                          <Group gap={4} wrap="nowrap">
                            <IconLink size={12} />
                            {builder.name}
                          </Group>
                        </Anchor>
                      ) : (
                        <Text size="sm" c="dimmed">
                          --
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {dt.dependencies.length > 0 ? (
                        <Group gap={4}>
                          {dt.dependencies.map((dep) => (
                            <Badge key={dep.derivativeTypeId} size="xs" variant="light" color="atlantis">
                              {dep.derivativeTypeName}
                            </Badge>
                          ))}
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">
                          --
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4} align="flex-start">
                        {applicabilityRules.length > 0 ? (
                          applicabilityRules.map((link) => (
                            <Group key={link.id} gap={4} wrap="nowrap">
                              <Badge
                                size="sm"
                                variant="light"
                                color="atlantis"
                                style={{ cursor: 'pointer', maxWidth: 180 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(
                                    `/projects/${projectId}/rules/${link.ruleId}/editor`,
                                  );
                                }}
                                title={`Open "${link.ruleName}" in editor`}
                              >
                                {link.ruleName}
                              </Badge>
                              <Tooltip label="Unlink rule" withArrow>
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="gray"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    unlinkRuleMutation.mutate({
                                      dtId: dt.id,
                                      linkId: link.id,
                                    });
                                  }}
                                >
                                  <IconTrash size={12} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          ))
                        ) : (
                          <Text size="xs" c="dimmed">
                            Applies to all
                          </Text>
                        )}
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          color="atlantis"
                          leftSection={<IconPlus size={12} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPickerForDt(dt);
                          }}
                        >
                          Add rule
                        </Button>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end">
                        <Tooltip label="Edit">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="blue"
                            onClick={() => handleOpenEdit(dt)}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Delete">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="red"
                            onClick={() => setDeleteTarget(dt)}
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
        title="Add Derivative Type"
        size="lg"
        closeOnClickOutside={false}
      >
        <DerivativeTypeForm
          form={createForm}
          onSubmit={handleCreate}
          isPending={createMutation.isPending}
          isError={createMutation.isError}
          errorMessage={(createMutation.error as Error)?.message}
          onCancel={() => {
            closeCreate();
            createForm.reset();
          }}
          submitLabel="Create Derivative Type"
          isCreate={true}
          derivativeTypes={derivativeTypes}
          builderOptions={builderOptions}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        opened={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit Derivative Type"
        size="lg"
        closeOnClickOutside={false}
      >
        <DerivativeTypeForm
          form={editForm}
          onSubmit={handleEdit}
          isPending={updateMutation.isPending}
          isError={updateMutation.isError}
          errorMessage={(updateMutation.error as Error)?.message}
          onCancel={() => setEditTarget(null)}
          submitLabel="Save Changes"
          isCreate={false}
          excludeId={editTarget?.id}
          derivativeTypes={derivativeTypes}
          builderOptions={builderOptions}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Derivative Type"
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
            All derivative values of this type on existing words will be lost.
          </Alert>
          {deleteTarget && deleteTarget.dependencies.length > 0 && (
            <Alert color="sunset" variant="light" title="Has dependencies">
              Other derivative types depend on this one. Deleting it may cause errors in
              their builders.
            </Alert>
          )}
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

      {/* Applicability rule picker */}
      <RulePickerModal
        opened={!!pickerForDt}
        onClose={() => setPickerForDt(null)}
        onPick={(ruleId) => {
          if (pickerForDt) {
            linkRuleMutation.mutate({ dtId: pickerForDt.id, ruleId });
          }
        }}
        onCreateNew={() => {
          const dt = pickerForDt;
          setPickerForDt(null);
          if (dt) {
            ruleCreateForm.reset();
            setCreateRuleForDt(dt);
          }
        }}
        excludeRuleIds={pickerForDt?.applicabilityRules.map((l) => l.ruleId) ?? []}
        title={pickerForDt ? `Add applicability rule - ${pickerForDt.name}` : 'Add rule'}
      />

      {/* Inline create-and-link rule modal */}
      <Modal
        opened={!!createRuleForDt}
        onClose={() => {
          setCreateRuleForDt(null);
          ruleCreateForm.reset();
        }}
        title={createRuleForDt ? `Create rule for ${createRuleForDt.name}` : 'Create rule'}
        size="md"
        closeOnClickOutside={false}
      >
        <form onSubmit={ruleCreateForm.onSubmit(handleCreateAndLinkRule)}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Noun Check"
              withAsterisk
              autoFocus
              {...ruleCreateForm.getInputProps('name')}
            />
            <Textarea
              label="Description"
              placeholder="Optional description"
              autosize
              minRows={2}
              {...ruleCreateForm.getInputProps('description')}
            />
            <Text size="xs" c="dimmed">
              The new rule will be added to the library and linked here as an
              applicability rule.
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
                  setCreateRuleForDt(null);
                  ruleCreateForm.reset();
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
    </Stack>
  );
}
