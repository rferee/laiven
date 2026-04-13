import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Title,
  Button,
  Group,
  Stack,
  Text,
  Badge,
  Card,
  TextInput,
  NumberInput,
  Textarea,
  Select,
  Modal,
  ActionIcon,
  Skeleton,
  Alert,
  Collapse,
  Tooltip,
  CloseButton,
  Box,
  SegmentedControl,
  Switch,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  IconPlus,
  IconTrash,
  IconChevronDown,
  IconChevronRight,
  IconAlertCircle,
  IconDatabase,
  IconGripVertical,
} from '@tabler/icons-react';
import SortableList from '@/components/SortableList';
import {
  getVariables,
  createVariable,
  updateVariable,
  deleteVariable,
  type Variable,
  type VariableItem,
  type CreateVariableData,
  type UpdateVariableData,
} from '@/api/variables';

function addItem(
  formItems: string[],
  setFormItems: (items: string[]) => void,
  value: string,
  clearInput: () => void,
) {
  const trimmed = value.trim();
  if (!trimmed) return;
  setFormItems([...formItems, trimmed]);
  clearInput();
}

function removeItem(
  formItems: string[],
  setFormItems: (items: string[]) => void,
  index: number,
) {
  setFormItems(formItems.filter((_, i) => i !== index));
}

function ConstantValueInput({
  value,
  onChange,
  dataType,
}: {
  value: string;
  onChange: (v: string) => void;
  dataType: Variable['dataType'];
}) {
  if (dataType === 'integer') {
    return (
      <NumberInput
        label="Value"
        size="sm"
        value={value === '' ? '' : Number(value)}
        onChange={(val) => onChange(String(val))}
      />
    );
  }
  if (dataType === 'boolean') {
    return (
      <Switch
        label="Value"
        size="sm"
        checked={value.toLowerCase() === 'true'}
        onChange={(e) => onChange(e.currentTarget.checked ? 'true' : 'false')}
      />
    );
  }
  return (
    <TextInput
      label="Value"
      size="sm"
      placeholder="Enter constant value"
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function ItemsEditor({
  items,
  setItems,
  inputValue,
  setInputValue,
  dataType = 'string',
}: {
  items: string[];
  setItems: (items: string[]) => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  dataType?: Variable['dataType'];
}) {
  const sortableItems = items.map((value, i) => ({ id: `item-${i}`, value, index: i }));

  const handleItemReorder = (newIds: string[]) => {
    const reordered = newIds.map((id) => {
      const idx = parseInt(id.replace('item-', ''), 10);
      return items[idx];
    });
    setItems(reordered);
  };

  const renderItemInput = (value: string, onChange: (v: string) => void) => {
    if (dataType === 'integer') {
      return (
        <NumberInput
          size="xs"
          value={value === '' ? '' : Number(value)}
          style={{ flex: 1 }}
          onChange={(val) => onChange(String(val))}
        />
      );
    }
    if (dataType === 'boolean') {
      return (
        <Select
          size="xs"
          value={value.toLowerCase() === 'true' ? 'true' : 'false'}
          data={[
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
          ]}
          style={{ flex: 1 }}
          onChange={(val) => onChange(val ?? 'false')}
        />
      );
    }
    return (
      <TextInput
        size="xs"
        value={value}
        style={{ flex: 1 }}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  };

  return (
    <Box>
      <Text size="sm" fw={500} mb={4}>
        Items ({items.length})
      </Text>
      <Stack gap={4}>
        {items.length > 0 && (
          <SortableList
            items={sortableItems}
            onReorder={handleItemReorder}
            renderItem={(item, _isDragging, dragHandleProps) => (
              <Group gap="xs" wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  size="xs"
                  color="gray"
                  ref={dragHandleProps.ref}
                  {...dragHandleProps.attributes}
                  {...dragHandleProps.listeners}
                  style={dragHandleProps.style}
                >
                  <IconGripVertical size={14} />
                </ActionIcon>
                {renderItemInput(item.value, (v) => {
                  const updated = [...items];
                  updated[item.index] = v;
                  setItems(updated);
                })}
                <CloseButton size="xs" onClick={() => removeItem(items, setItems, item.index)} />
              </Group>
            )}
          />
        )}
        <Group gap="xs" wrap="nowrap">
          <Box w={24} />
          {dataType === 'boolean' ? (
            <Select
              size="xs"
              placeholder="Add new item..."
              value={inputValue || null}
              data={[
                { value: 'true', label: 'True' },
                { value: 'false', label: 'False' },
              ]}
              style={{ flex: 1 }}
              onChange={(val) => {
                if (val) {
                  addItem(items, setItems, val, () => setInputValue(''));
                }
              }}
            />
          ) : dataType === 'integer' ? (
            <NumberInput
              size="xs"
              placeholder="Add new item..."
              value={inputValue === '' ? '' : Number(inputValue)}
              style={{ flex: 1 }}
              onChange={(val) => setInputValue(String(val))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem(items, setItems, inputValue, () => setInputValue(''));
                }
              }}
            />
          ) : (
            <TextInput
              size="xs"
              placeholder="Add new item..."
              value={inputValue}
              style={{ flex: 1 }}
              onChange={(e) => setInputValue(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem(items, setItems, inputValue, () => setInputValue(''));
                }
              }}
            />
          )}
          {dataType !== 'boolean' && (
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => addItem(items, setItems, inputValue, () => setInputValue(''))}
            >
              Add
            </Button>
          )}
        </Group>
      </Stack>
    </Box>
  );
}

const DATA_TYPES: { value: Variable['dataType']; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'one-of', label: 'One-of' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Boolean' },
];

const KIND_OPTIONS = [
  { value: 'constant', label: 'Constant (Single Value)' },
  { value: 'array', label: 'Array (List of Values)' },
];

const TYPE_COLORS: Record<string, string> = {
  string: 'blue',
  'one-of': 'violet',
  integer: 'teal',
  boolean: 'orange',
};

interface CreateFormValues {
  name: string;
  kind: 'constant' | 'array';
  dataType: Variable['dataType'];
  description: string;
  items: string[];
  constantValue: string;
}

interface EditFormValues {
  name: string;
  kind: 'constant' | 'array';
  dataType: Variable['dataType'];
  description: string;
  items: string[];
  constantValue: string;
}

function itemsToStrings(items: VariableItem[]): string[] {
  return items.map((item) => String(item.value));
}

function stringsToItems(strings: string[], dataType: Variable['dataType']): VariableItem[] {
  return strings.map((s) => {
    let value: string | number | boolean = s;
    if (dataType === 'integer') {
      value = parseInt(s, 10);
      if (isNaN(value)) value = 0;
    } else if (dataType === 'boolean') {
      value = s.toLowerCase() === 'true';
    }
    return { value };
  });
}

export default function VariablesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<Variable | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newItemValue, setNewItemValue] = useState('');
  const [editNewItemValue, setEditNewItemValue] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', projectId, 'variables'],
    queryFn: () => getVariables(projectId!),
    enabled: !!projectId,
  });

  const variables = data?.items ?? [];

  const createForm = useForm<CreateFormValues>({
    initialValues: {
      name: '',
      kind: 'array',
      dataType: 'string',
      description: '',
      items: [],
      constantValue: '',
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const editForm = useForm<EditFormValues>({
    initialValues: {
      name: '',
      kind: 'array',
      dataType: 'string',
      description: '',
      items: [],
      constantValue: '',
    },
    validate: {
      name: (v) => (!v.trim() ? 'Name is required' : null),
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateVariableData) => createVariable(projectId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'variables'] });
      closeCreate();
      createForm.reset();
      setNewItemValue('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateVariableData }) =>
      updateVariable(projectId!, id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'variables'] });
      setExpandedId(null);
      setEditNewItemValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteVariable(projectId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'variables'] });
      setDeleteTarget(null);
    },
  });

  const handleCreate = (values: CreateFormValues) => {
    const items = values.kind === 'constant'
      ? stringsToItems([values.constantValue], values.dataType)
      : stringsToItems(values.items, values.dataType);
    const payload: CreateVariableData = {
      name: values.name,
      kind: values.kind,
      dataType: values.dataType,
      items,
      description: values.description || undefined,
    };
    createMutation.mutate(payload);
  };

  const handleEdit = (id: string, values: EditFormValues) => {
    const items = values.kind === 'constant'
      ? stringsToItems([values.constantValue], values.dataType)
      : stringsToItems(values.items, values.dataType);
    const payload: UpdateVariableData = {
      name: values.name,
      kind: values.kind,
      dataType: values.dataType,
      items,
      description: values.description || undefined,
    };
    updateMutation.mutate({ id, payload });
  };

  const handleExpand = (v: Variable) => {
    if (expandedId === v.id) {
      setExpandedId(null);
    } else {
      setExpandedId(v.id);
      const isConstant = v.kind === 'constant';
      editForm.setValues({
        name: v.name,
        kind: v.kind ?? 'array',
        dataType: v.dataType,
        description: v.description ?? '',
        items: isConstant ? [] : itemsToStrings(v.items),
        constantValue: isConstant && v.items.length > 0 ? String(v.items[0].value) : '',
      });
      setEditNewItemValue('');
    }
  };

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={18} />} color="red" title="Error loading variables">
        {(error as Error).message}
      </Alert>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <IconDatabase size={28} stroke={1.5} />
          <Title order={2}>Variables</Title>
        </Group>
        <Button size="sm" leftSection={<IconPlus size={16} />} onClick={openCreate}>
          Add Variable
        </Button>
      </Group>
      <Text c="dimmed" size="sm">
        Reusable constants and value lists referenced by rules and builders.
      </Text>

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={72} radius="md" />
          ))}
        </Stack>
      ) : variables.length === 0 ? (
        <Card withBorder radius="md" padding="md">
          <Stack align="center" gap="sm" py="lg">
            <IconDatabase size={48} stroke={1} color="var(--mantine-color-dimmed)" />
            <Text c="dimmed" size="lg" fw={500}>
              No variables defined yet
            </Text>
            <Text c="dimmed" size="sm">
              Variables are reusable constants and value lists referenced by rules and builders.
            </Text>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Create your first variable
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          {variables.map((v) => (
            <Card
              key={v.id}
              withBorder
              radius="md"
              padding="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => handleExpand(v)}
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                  {expandedId === v.id ? (
                    <IconChevronDown size={16} color="var(--mantine-color-dimmed)" />
                  ) : (
                    <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
                  )}
                  <Text fw={500} truncate style={{ minWidth: 0 }}>
                    {v.name}
                  </Text>
                  <Badge size="sm" variant="light" color="gray">
                    {v.kind === 'constant' ? 'Constant' : 'Array'}
                  </Badge>
                  <Badge size="sm" variant="light" color={TYPE_COLORS[v.dataType] ?? 'gray'}>
                    {v.dataType}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    {v.items.length} item{v.items.length !== 1 ? 's' : ''}
                  </Text>
                </Group>
                <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                  <Tooltip label="Delete" events={{ hover: true, focus: false, touch: false }}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      color="red"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        setDeleteTarget(v);
                      }}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <Collapse in={expandedId === v.id}>
                <form
                  onSubmit={editForm.onSubmit((values) => handleEdit(v.id, values))}
                  style={{ marginTop: 12 }}
                >
                  <Stack gap="sm" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
                    <TextInput
                      label="Name"
                      placeholder="Variable name"
                      {...editForm.getInputProps('name')}
                    />
                    <Box>
                      <Text size="sm" fw={500} mb={4}>Kind</Text>
                      <SegmentedControl
                        fullWidth
                        size="xs"
                        data={KIND_OPTIONS}
                        value={editForm.values.kind}
                        onChange={(val) => editForm.setFieldValue('kind', val as 'constant' | 'array')}
                      />
                    </Box>
                    <Select
                      label="Data Type"
                      data={DATA_TYPES}
                      {...editForm.getInputProps('dataType')}
                    />
                    <Textarea
                      label="Description"
                      placeholder="Optional description"
                      autosize
                      minRows={2}
                      {...editForm.getInputProps('description')}
                    />
                    {editForm.values.kind === 'constant' ? (
                      <ConstantValueInput
                        value={editForm.values.constantValue}
                        onChange={(val) => editForm.setFieldValue('constantValue', val)}
                        dataType={editForm.values.dataType}
                      />
                    ) : (
                      <ItemsEditor
                        items={editForm.values.items}
                        setItems={(items) => editForm.setFieldValue('items', items)}
                        inputValue={editNewItemValue}
                        setInputValue={setEditNewItemValue}
                        dataType={editForm.values.dataType}
                      />
                    )}
                    <Group justify="flex-end" gap="sm">
                      <Button variant="default" size="xs" onClick={() => setExpandedId(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="xs" loading={updateMutation.isPending}>
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
              </Collapse>
            </Card>
          ))}
        </Stack>
      )}

      {/* Create Modal */}
      <Modal
        opened={createOpened}
        onClose={() => {
          closeCreate();
          createForm.reset();
          setNewItemValue('');
        }}
        title="Add Variable"
        size="lg"
        closeOnClickOutside={false}
      >
        <form onSubmit={createForm.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g. Vowels, Consonant Classes"
              withAsterisk
              autoFocus
              {...createForm.getInputProps('name')}
            />
            <Box>
              <Text size="sm" fw={500} mb={4}>Kind</Text>
              <SegmentedControl
                fullWidth
                size="xs"
                data={KIND_OPTIONS}
                value={createForm.values.kind}
                onChange={(val) => createForm.setFieldValue('kind', val as 'constant' | 'array')}
              />
            </Box>
            <Select
              label="Data Type"
              data={DATA_TYPES}
              withAsterisk
              {...createForm.getInputProps('dataType')}
            />
            <Textarea
              label="Description"
              placeholder="Optional description"
              autosize
              minRows={2}
              {...createForm.getInputProps('description')}
            />
            {createForm.values.kind === 'constant' ? (
              <ConstantValueInput
                value={createForm.values.constantValue}
                onChange={(val) => createForm.setFieldValue('constantValue', val)}
                dataType={createForm.values.dataType}
              />
            ) : (
              <ItemsEditor
                items={createForm.values.items}
                setItems={(items) => createForm.setFieldValue('items', items)}
                inputValue={newItemValue}
                setInputValue={setNewItemValue}
                dataType={createForm.values.dataType}
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
                  setNewItemValue('');
                }}
              >
                Cancel
              </Button>
              <Button type="submit" loading={createMutation.isPending}>
                Create Variable
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Variable"
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
            This may affect rules and builders that reference this variable.
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
