import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  Group,
  Stack,
  Text,
  Badge,
  TextInput,
  Textarea,
  Select,
  Switch,
  Modal,
  Alert,
  TagsInput,
  SegmentedControl,
  Input,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconAlertCircle,
  IconListDetails,
} from '@tabler/icons-react';
import SortableList from '@/components/SortableList';
import PageHeader from '@/components/PageHeader';
import SkeletonList from '@/components/SkeletonList';
import EmptyStateCard from '@/components/EmptyStateCard';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import ExpandableCrudRow from '@/components/ExpandableCrudRow';
import {
  getAttributes,
  createAttribute,
  updateAttribute,
  reorderAttribute,
  deleteAttribute,
  type Attribute,
  type CreateAttributeData,
  type UpdateAttributeData,
  type UniqueMode,
} from '@/api/attributes';

const ATTRIBUTE_TYPES: { value: Attribute['type']; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'one-of', label: 'One-of' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'single-relation', label: 'Single Relation' },
  { value: 'multiple-relation', label: 'Multiple Relation' },
];

const TYPE_COLORS: Record<string, string> = {
  string: 'blue',
  'one-of': 'violet',
  integer: 'teal',
  boolean: 'orange',
  'single-relation': 'cyan',
  'multiple-relation': 'indigo',
};

const UNIQUE_MODE_OPTIONS: { value: UniqueMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'case_sensitive', label: 'Case Sensitive' },
  { value: 'case_insensitive', label: 'Case Insensitive' },
];

function AttributeTypeLabel(type: string): string {
  return ATTRIBUTE_TYPES.find((t) => t.value === type)?.label ?? type;
}

interface CreateFormValues {
  name: string;
  type: Attribute['type'];
  required: boolean;
  description: string;
  options: string[];
  uniqueMode: UniqueMode;
}

interface EditFormValues {
  name: string;
  type: Attribute['type'];
  required: boolean;
  description: string;
  options: string[];
  uniqueMode: UniqueMode;
}

export default function AttributesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<Attribute | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', projectId, 'attributes'],
    queryFn: () => getAttributes(projectId!),
    enabled: !!projectId,
  });

  const attributes = data?.items ?? [];

  const createForm = useForm<CreateFormValues>({
    initialValues: {
      name: '',
      type: 'string',
      required: false,
      description: '',
      options: [],
      uniqueMode: 'off',
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const editForm = useForm<EditFormValues>({
    initialValues: {
      name: '',
      type: 'string',
      required: false,
      description: '',
      options: [],
      uniqueMode: 'off',
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAttributeData) => createAttribute(projectId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'attributes'] });
      closeCreate();
      createForm.reset();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAttributeData }) =>
      updateAttribute(projectId!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'attributes'] });
      setExpandedId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttribute(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'attributes'] });
      setDeleteTarget(null);
    },
  });

  const handleCreate = (values: CreateFormValues) => {
    const payload: CreateAttributeData = {
      name: values.name,
      type: values.type,
      required: values.required,
      description: values.description || undefined,
      options: values.type === 'one-of' ? values.options : undefined,
      uniqueMode: values.uniqueMode,
    };
    createMutation.mutate(payload);
  };

  const handleEdit = (id: string, values: EditFormValues) => {
    const payload: UpdateAttributeData = {
      name: values.name,
      type: values.type,
      required: values.required,
      description: values.description || undefined,
      options: values.type === 'one-of' ? values.options : undefined,
      uniqueMode: values.uniqueMode,
    };
    updateMutation.mutate({ id, payload });
  };

  const handleReorder = async (newIds: string[]) => {
    for (let i = 0; i < newIds.length; i++) {
      const id = newIds[i];
      const attr = attributes.find((a) => a.id === id);
      if (attr && attr.displayOrder !== i) {
        await reorderAttribute(projectId!, id, i);
      }
    }
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'attributes'] });
  };

  const handleExpand = (attr: Attribute) => {
    if (expandedId === attr.id) {
      setExpandedId(null);
    } else {
      setExpandedId(attr.id);
      editForm.setValues({
        name: attr.name,
        type: attr.type,
        required: attr.required,
        description: attr.description ?? '',
        options: attr.options ?? [],
        uniqueMode: attr.uniqueMode ?? 'off',
      });
    }
  };

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={18} />} color="red" title="Error loading attributes">
        {(error as Error).message}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconListDetails size={28} stroke={1.5} />}
        title="Attributes"
        description="Define the fields that each word in your language will have."
        actions={
          <Button size="sm" leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Add Attribute
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonList height={72} />
      ) : attributes.length === 0 ? (
        <EmptyStateCard
          icon={<IconListDetails size={48} stroke={1} color="var(--mantine-color-dimmed)" />}
          title="No attributes defined yet"
          description="Attributes define the fields that each word in your language will have."
          action={{
            label: 'Create your first attribute',
            icon: <IconPlus size={16} />,
            onClick: openCreate,
          }}
        />
      ) : (
        <Stack gap="xs">
          <SortableList
            items={attributes}
            onReorder={handleReorder}
            renderItem={(attr, _isDragging, dragHandleProps) => {
              const badges: { label: string; color?: string }[] = [
                { label: AttributeTypeLabel(attr.type), color: TYPE_COLORS[attr.type] ?? 'gray' },
              ];
              if (attr.uniqueMode && attr.uniqueMode !== 'off') {
                badges.push({
                  label: attr.uniqueMode === 'case_insensitive' ? 'Unique (CI)' : 'Unique',
                  color: 'blue',
                });
              }
              return (
                <ExpandableCrudRow
                  title={attr.name}
                  badges={badges}
                  meta={
                    attr.description ? (
                      <Text c="dimmed" size="xs" truncate style={{ minWidth: 0 }}>
                        {attr.description}
                      </Text>
                    ) : undefined
                  }
                  rightSlot={
                    attr.required ? (
                      <Badge size="sm" variant="dot" color="red">
                        Required
                      </Badge>
                    ) : undefined
                  }
                  expanded={expandedId === attr.id}
                  onToggle={() => handleExpand(attr)}
                  onDelete={() => setDeleteTarget(attr)}
                  dragHandle={dragHandleProps}
                  deleteAriaLabel="Delete attribute"
                  expandedContent={
                    <form
                      onSubmit={editForm.onSubmit((values) => handleEdit(attr.id, values))}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <Stack gap="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                        <Group grow align="flex-end">
                          <TextInput
                            label="Name"
                            placeholder="Attribute name"
                            {...editForm.getInputProps('name')}
                          />
                          <Select
                            label="Type"
                            data={ATTRIBUTE_TYPES}
                            {...editForm.getInputProps('type')}
                          />
                          <Switch
                            label="Required"
                            checked={editForm.values.required}
                            onChange={(e) => editForm.setFieldValue('required', e.currentTarget.checked)}
                            style={{ flexGrow: 0, flexShrink: 0 }}
                          />
                        </Group>
                        <Input.Wrapper
                          label="Unique"
                          description="If set, only one word in this project can have this attribute value."
                        >
                          <SegmentedControl
                            fullWidth
                            mt={4}
                            data={UNIQUE_MODE_OPTIONS}
                            value={editForm.values.uniqueMode}
                            onChange={(val) => editForm.setFieldValue('uniqueMode', val as UniqueMode)}
                          />
                        </Input.Wrapper>
                        <Textarea
                          label="Description"
                          placeholder="Optional description"
                          autosize
                          minRows={2}
                          {...editForm.getInputProps('description')}
                        />
                        {editForm.values.type === 'one-of' && (
                          <TagsInput
                            label="Options"
                            placeholder="Type an option and press Enter"
                            value={editForm.values.options}
                            onChange={(val) => editForm.setFieldValue('options', val)}
                          />
                        )}
                        <Group justify="flex-end" gap="sm">
                          <Button variant="default" size="xs" onClick={() => setExpandedId(null)}>
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="xs"
                            loading={updateMutation.isPending}
                          >
                            Save Changes
                          </Button>
                        </Group>
                        {updateMutation.isError && (
                          <Alert color="red" variant="light">
                            {(updateMutation.error as Error).message}
                          </Alert>
                        )}
                      </Stack>
                    </form>
                  }
                />
              );
            }}
          />
        </Stack>
      )}

      {/* Create Modal */}
      <Modal
        opened={createOpened}
        onClose={() => {
          closeCreate();
          createForm.reset();
        }}
        title="Add Attribute"
        size="md"
        closeOnClickOutside={false}
      >
        <form onSubmit={createForm.onSubmit(handleCreate)}>
          <Stack gap="md">
            <Group grow align="flex-end">
              <TextInput
                label="Name"
                placeholder="e.g. Word Type, Pronunciation"
                withAsterisk
                autoFocus
                {...createForm.getInputProps('name')}
              />
              <Select
                label="Type"
                data={ATTRIBUTE_TYPES}
                withAsterisk
                {...createForm.getInputProps('type')}
              />
              <Switch
                label="Required"
                checked={createForm.values.required}
                onChange={(e) => createForm.setFieldValue('required', e.currentTarget.checked)}
                style={{ flexGrow: 0, flexShrink: 0 }}
              />
            </Group>
            <Input.Wrapper
              label="Unique"
              description="If set, only one word in this project can have this attribute value."
            >
              <SegmentedControl
                fullWidth
                mt={4}
                data={UNIQUE_MODE_OPTIONS}
                value={createForm.values.uniqueMode}
                onChange={(val) => createForm.setFieldValue('uniqueMode', val as UniqueMode)}
              />
            </Input.Wrapper>
            <Textarea
              label="Description"
              placeholder="Optional description of this attribute"
              autosize
              minRows={2}
              {...createForm.getInputProps('description')}
            />
            {createForm.values.type === 'one-of' && (
              <TagsInput
                label="Options"
                placeholder="Type an option and press Enter"
                description="Define the allowed values for this attribute"
                value={createForm.values.options}
                onChange={(val) => createForm.setFieldValue('options', val)}
              />
            )}
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
                Create Attribute
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        entityLabel="Attribute"
        warning={
          <Text size="sm">
            This may affect rules and builders that reference this attribute, and all
            values of this attribute on existing words will be lost.
          </Text>
        }
        mutation={deleteMutation}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </Stack>
  );
}
