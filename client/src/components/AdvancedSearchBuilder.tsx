import { useCallback } from 'react';
import {
  Paper,
  Group,
  Stack,
  Select,
  TextInput,
  NumberInput,
  ActionIcon,
  SegmentedControl,
  Button,
  Text,
  Switch,
  Tooltip,
  Box,
} from '@mantine/core';
import {
  IconPlus,
  IconTrash,
  IconFolderPlus,
} from '@tabler/icons-react';
import type { Attribute } from '@/api/attributes';

export type LogicOperator = 'AND' | 'OR' | 'NOT';

export interface SearchConditionNode {
  id: string;
  type: 'condition';
  attributeId: string;
  operator: string;
  value: unknown;
  valueTo?: unknown; // for "between" operator
}

export interface SearchGroupNode {
  id: string;
  type: 'group';
  logic: LogicOperator;
  children: SearchNode[];
}

export type SearchNode = SearchConditionNode | SearchGroupNode;

const STRING_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

const ONE_OF_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'is_one_of', label: 'is one of' },
  { value: 'is_not_one_of', label: 'is not one of' },
];

const INTEGER_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'between', label: 'between' },
];

const BOOLEAN_OPERATORS = [
  { value: 'equals', label: 'equals' },
];

const RELATION_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

const MULTI_RELATION_OPERATORS = [
  { value: 'contains', label: 'contains' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'count_equals', label: 'count equals' },
  { value: 'count_greater_than', label: 'count greater than' },
  { value: 'count_less_than', label: 'count less than' },
];

function getOperatorsForType(type: Attribute['type']) {
  switch (type) {
    case 'string':
      return STRING_OPERATORS;
    case 'one-of':
      return ONE_OF_OPERATORS;
    case 'integer':
      return INTEGER_OPERATORS;
    case 'boolean':
      return BOOLEAN_OPERATORS;
    case 'single-relation':
      return RELATION_OPERATORS;
    case 'multiple-relation':
      return MULTI_RELATION_OPERATORS;
    default:
      return STRING_OPERATORS;
  }
}

const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty']);

let _nextId = 1;
function generateId(): string {
  return `node_${Date.now()}_${_nextId++}`;
}

export function createEmptyCondition(): SearchConditionNode {
  return {
    id: generateId(),
    type: 'condition',
    attributeId: '',
    operator: '',
    value: '',
  };
}

export function createEmptyGroup(): SearchGroupNode {
  return {
    id: generateId(),
    type: 'group',
    logic: 'AND',
    children: [createEmptyCondition()],
  };
}

interface AdvancedSearchBuilderProps {
  attributes: Attribute[];
  rootGroup: SearchGroupNode;
  onQueryChange: (group: SearchGroupNode) => void;
}

function updateNodeInTree(
  root: SearchGroupNode,
  nodeId: string,
  updater: (node: SearchNode) => SearchNode,
): SearchGroupNode {
  return {
    ...root,
    children: root.children.map((child) => {
      if (child.id === nodeId) {
        return updater(child);
      }
      if (child.type === 'group') {
        return updateNodeInTree(child, nodeId, updater);
      }
      return child;
    }),
  };
}

function removeNodeFromTree(
  root: SearchGroupNode,
  nodeId: string,
): SearchGroupNode {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== nodeId)
      .map((child) => {
        if (child.type === 'group') {
          return removeNodeFromTree(child, nodeId);
        }
        return child;
      }),
  };
}

function addChildToGroup(
  root: SearchGroupNode,
  groupId: string,
  newChild: SearchNode,
): SearchGroupNode {
  if (root.id === groupId) {
    return {
      ...root,
      children: [...root.children, newChild],
    };
  }
  return {
    ...root,
    children: root.children.map((child) => {
      if (child.type === 'group') {
        return addChildToGroup(child, groupId, newChild);
      }
      return child;
    }),
  };
}

interface ConditionRowProps {
  condition: SearchConditionNode;
  attributes: Attribute[];
  onUpdate: (id: string, updates: Partial<SearchConditionNode>) => void;
  onRemove: (id: string) => void;
}

function ConditionRow({ condition, attributes, onUpdate, onRemove }: ConditionRowProps) {
  const selectedAttribute = attributes.find((a) => a.id === condition.attributeId);
  const operators = selectedAttribute
    ? getOperatorsForType(selectedAttribute.type)
    : [];
  const needsValue = !NO_VALUE_OPERATORS.has(condition.operator);
  const isBetween = condition.operator === 'between';

  const attributeOptions = attributes.map((a) => ({
    value: a.id,
    label: a.name,
  }));

  const handleAttributeChange = (val: string | null) => {
    const attr = attributes.find((a) => a.id === val);
    const newOps = attr ? getOperatorsForType(attr.type) : [];
    onUpdate(condition.id, {
      attributeId: val ?? '',
      operator: newOps.length > 0 ? newOps[0].value : '',
      value: '',
      valueTo: undefined,
    });
  };

  const renderValueInput = () => {
    if (!needsValue || !selectedAttribute) return null;

    const attrType = selectedAttribute.type;

    if (attrType === 'boolean') {
      return (
        <Switch
          checked={condition.value === true || condition.value === 'true'}
          onChange={(e) => onUpdate(condition.id, { value: e.currentTarget.checked })}
          label={condition.value ? 'True' : 'False'}
          size="sm"
          style={{ minWidth: 100 }}
        />
      );
    }

    if (attrType === 'integer') {
      if (isBetween) {
        return (
          <Group gap="xs" wrap="nowrap">
            <NumberInput
              placeholder="From"
              value={typeof condition.value === 'number' ? condition.value : ''}
              onChange={(val) => onUpdate(condition.id, { value: val })}
              size="sm"
              style={{ width: 100 }}
            />
            <Text size="sm" c="dimmed">to</Text>
            <NumberInput
              placeholder="To"
              value={typeof condition.valueTo === 'number' ? condition.valueTo : ''}
              onChange={(val) => onUpdate(condition.id, { valueTo: val })}
              size="sm"
              style={{ width: 100 }}
            />
          </Group>
        );
      }
      return (
        <NumberInput
          placeholder="Value"
          value={typeof condition.value === 'number' ? condition.value : ''}
          onChange={(val) => onUpdate(condition.id, { value: val })}
          size="sm"
          style={{ minWidth: 120 }}
        />
      );
    }

    if (attrType === 'one-of') {
      const opts = (selectedAttribute.options ?? []).map((o) => ({
        value: o,
        label: o,
      }));

      if (condition.operator === 'is_one_of' || condition.operator === 'is_not_one_of') {
        return (
          <Select
            placeholder="Select values"
            data={opts}
            value={Array.isArray(condition.value) ? (condition.value as string[])[0] ?? null : String(condition.value || '')}
            onChange={(val) => onUpdate(condition.id, { value: val })}
            size="sm"
            style={{ minWidth: 160 }}
            searchable
            clearable
          />
        );
      }

      return (
        <Select
          placeholder="Select value"
          data={opts}
          value={condition.value != null ? String(condition.value) : null}
          onChange={(val) => onUpdate(condition.id, { value: val })}
          size="sm"
          style={{ minWidth: 160 }}
          searchable
          clearable
        />
      );
    }

    return (
      <TextInput
        placeholder="Value"
        value={condition.value != null ? String(condition.value) : ''}
        onChange={(e) => onUpdate(condition.id, { value: e.currentTarget.value })}
        size="sm"
        style={{ minWidth: 160 }}
      />
    );
  };

  return (
    <Group gap="xs" wrap="nowrap" align="flex-end">
      <Select
        placeholder="Attribute"
        data={attributeOptions}
        value={condition.attributeId || null}
        onChange={handleAttributeChange}
        size="sm"
        style={{ minWidth: 160 }}
        searchable
      />
      <Select
        placeholder="Operator"
        data={operators}
        value={condition.operator || null}
        onChange={(val) => onUpdate(condition.id, { operator: val ?? '' })}
        size="sm"
        style={{ minWidth: 140 }}
        disabled={!selectedAttribute}
      />
      {renderValueInput()}
      <Tooltip label="Remove condition">
        <ActionIcon
          variant="subtle"
          color="red"
          size="sm"
          onClick={() => onRemove(condition.id)}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

interface ConditionGroupProps {
  group: SearchGroupNode;
  attributes: Attribute[];
  rootGroup: SearchGroupNode;
  onRootChange: (newRoot: SearchGroupNode) => void;
  depth: number;
  isRoot?: boolean;
}

function ConditionGroup({
  group,
  attributes,
  rootGroup,
  onRootChange,
  depth,
  isRoot = false,
}: ConditionGroupProps) {
  const handleLogicChange = useCallback(
    (val: string) => {
      const updated = updateNodeInTree(rootGroup, group.id, (node) => ({
        ...node,
        logic: val as LogicOperator,
      })) as SearchGroupNode;
      onRootChange(updated);
    },
    [rootGroup, group.id, onRootChange],
  );

  const handleAddCondition = useCallback(() => {
    const updated = addChildToGroup(rootGroup, group.id, createEmptyCondition());
    onRootChange(updated);
  }, [rootGroup, group.id, onRootChange]);

  const handleAddGroup = useCallback(() => {
    const updated = addChildToGroup(rootGroup, group.id, createEmptyGroup());
    onRootChange(updated);
  }, [rootGroup, group.id, onRootChange]);

  const handleRemoveNode = useCallback(
    (nodeId: string) => {
      const updated = removeNodeFromTree(rootGroup, nodeId);
      onRootChange(updated);
    },
    [rootGroup, onRootChange],
  );

  const handleUpdateCondition = useCallback(
    (nodeId: string, updates: Partial<SearchConditionNode>) => {
      const updated = updateNodeInTree(rootGroup, nodeId, (node) => ({
        ...node,
        ...updates,
      } as SearchNode)) as SearchGroupNode;
      onRootChange(updated);
    },
    [rootGroup, onRootChange],
  );

  const handleRemoveGroup = useCallback(() => {
    if (isRoot) return;
    const updated = removeNodeFromTree(rootGroup, group.id);
    onRootChange(updated);
  }, [rootGroup, group.id, isRoot, onRootChange]);

  const borderColor = depth === 0 ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-dark-5)';

  return (
    <Paper
      p="sm"
      radius="sm"
      withBorder
      style={{
        borderColor,
        borderStyle: depth > 0 ? 'dashed' : 'solid',
        backgroundColor: depth > 0 ? 'rgba(0,0,0,0.05)' : undefined,
      }}
    >
      <Stack gap="xs">
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <SegmentedControl
              size="xs"
              data={[
                { label: 'AND', value: 'AND' },
                { label: 'OR', value: 'OR' },
                { label: 'NOT', value: 'NOT' },
              ]}
              value={group.logic}
              onChange={handleLogicChange}
            />
            {group.logic === 'NOT' && (
              <Text size="xs" c="dimmed" fs="italic">
                Negates all conditions in this group
              </Text>
            )}
          </Group>
          {!isRoot && (
            <Tooltip label="Remove group">
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={handleRemoveGroup}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {group.children.map((child) =>
          child.type === 'condition' ? (
            <Box key={child.id} ml="md">
              <ConditionRow
                condition={child}
                attributes={attributes}
                onUpdate={handleUpdateCondition}
                onRemove={handleRemoveNode}
              />
            </Box>
          ) : (
            <Box key={child.id} ml="md">
              <ConditionGroup
                group={child}
                attributes={attributes}
                rootGroup={rootGroup}
                onRootChange={onRootChange}
                depth={depth + 1}
              />
            </Box>
          ),
        )}

        {group.children.length === 0 && (
          <Text size="sm" c="dimmed" fs="italic" ta="center" py="xs">
            No conditions. Add one below.
          </Text>
        )}

        <Group gap="xs" ml="md">
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={handleAddCondition}
          >
            Add Condition
          </Button>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconFolderPlus size={14} />}
            onClick={handleAddGroup}
            color="sunset"
          >
            Add Group
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

export default function AdvancedSearchBuilder({
  attributes,
  rootGroup,
  onQueryChange,
}: AdvancedSearchBuilderProps) {
  return (
    <ConditionGroup
      group={rootGroup}
      attributes={attributes}
      rootGroup={rootGroup}
      onRootChange={onQueryChange}
      depth={0}
      isRoot
    />
  );
}

export function buildSearchConditions(
  group: SearchGroupNode,
  attributes: Attribute[],
): { conditions?: Array<Record<string, unknown>>; logic?: LogicOperator } | null {
  const conditions: Array<Record<string, unknown>> = [];

  for (const child of group.children) {
    if (child.type === 'condition') {
      if (!child.attributeId || !child.operator) continue;
      const attr = attributes.find((a) => a.id === child.attributeId);
      if (!attr) continue;

      const cond: Record<string, unknown> = {
        type: 'attribute',
        field: attr.identifier,
        operator: child.operator,
      };

      if (!NO_VALUE_OPERATORS.has(child.operator)) {
        if (child.operator === 'between') {
          cond.value = [child.value, child.valueTo];
        } else {
          cond.value = child.value;
        }
      }

      conditions.push(cond);
    } else {
      const nested = buildSearchConditions(child, attributes);
      if (nested && nested.conditions && nested.conditions.length > 0) {
        conditions.push({
          type: 'group',
          logic: child.logic,
          children: nested.conditions,
        });
      }
    }
  }

  if (conditions.length === 0) return null;

  return {
    conditions,
    logic: group.logic,
  };
}
