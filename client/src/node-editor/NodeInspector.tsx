import {
  Stack,
  Text,
  TextInput,
  NumberInput,
  Select,
  Paper,
  Divider,
  Button,
  Group,
  JsonInput,
  Badge,
  Switch,
  SegmentedControl,
} from '@mantine/core';
import { useNodeTypes } from './useNodeTypes';
import type { Node } from '@xyflow/react';

interface NodeInspectorProps {
  node: Node | null;
  attributes?: Array<{ identifier: string; name: string }>;
  variables?: Array<{ name: string }>;
  onUpdateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
}

type LiteralType = 'string' | 'integer' | 'boolean';

export function NodeInspector({
  node,
  attributes,
  variables,
  onUpdateNodeData,
  onDeleteNode,
}: NodeInspectorProps) {
  const { getNodeTypeInfo } = useNodeTypes();

  if (!node) {
    return (
      <Stack p="sm" align="center" justify="center" h="100%">
        <Text size="sm" c="dimmed">
          Select a node to inspect
        </Text>
      </Stack>
    );
  }

  const nodeInfo = getNodeTypeInfo(node.type!);

  if (!nodeInfo) {
    return (
      <Stack p="sm">
        <Text size="sm" c="red">
          Unknown node type: {node.type}
        </Text>
      </Stack>
    );
  }

  const updateField = (key: string, value: unknown) => {
    onUpdateNodeData(node.id, { ...node.data, [key]: value });
  };

  const updateFields = (updates: Record<string, unknown>) => {
    onUpdateNodeData(node.id, { ...node.data, ...updates });
  };

  return (
    <Stack gap="sm" p="sm" style={{ height: '100%', overflow: 'auto' }}>
      <Text fw={600} size="sm">
        Node Inspector
      </Text>

      <Paper p="xs" withBorder>
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {nodeInfo.label}
          </Text>
          <Badge size="xs">{nodeInfo.category}</Badge>
        </Group>
        <Text size="xs" c="dimmed">
          ID: {node.id}
        </Text>
      </Paper>

      {nodeInfo.description && (
        <Paper p="xs" withBorder bg="var(--mantine-color-default-hover)">
          <Text size="xs" c="dimmed">
            {nodeInfo.description}
          </Text>
        </Paper>
      )}

      {nodeInfo.configFields && nodeInfo.configFields.length > 0 && (
        <>
          <Divider label="Configuration" labelPosition="center" />
          {nodeInfo.configFields.map((field) => {
            const currentValue = node.data[field.key];
            const description = field.description;

            switch (field.type) {
              case 'text':
              case 'regex':
                return (
                  <TextInput
                    key={field.key}
                    label={field.label}
                    description={description}
                    size="xs"
                    value={String(currentValue ?? '')}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={
                      field.type === 'regex' ? 'Regular expression...' : undefined
                    }
                  />
                );

              case 'number':
                return (
                  <NumberInput
                    key={field.key}
                    label={field.label}
                    description={description}
                    size="xs"
                    value={Number(currentValue ?? 0)}
                    onChange={(val) => updateField(field.key, val)}
                  />
                );

              case 'boolean':
                return (
                  <Switch
                    key={field.key}
                    label={field.label}
                    description={description}
                    size="xs"
                    checked={Boolean(currentValue)}
                    onChange={(e) =>
                      updateField(field.key, e.currentTarget.checked)
                    }
                  />
                );

              case 'select':
                return (
                  <Select
                    key={field.key}
                    label={field.label}
                    description={description}
                    size="xs"
                    data={
                      field.options?.map((o) => ({
                        value: o,
                        label: o.replace(/_/g, ' '),
                      })) ?? []
                    }
                    value={String(currentValue ?? '')}
                    onChange={(val) => updateField(field.key, val)}
                  />
                );

              case 'attribute':
                return (
                  <Select
                    key={field.key}
                    label={field.label}
                    description={description}
                    size="xs"
                    data={
                      attributes?.map((a) => ({
                        value: a.identifier,
                        label: a.name,
                      })) ?? []
                    }
                    value={String(currentValue ?? '')}
                    onChange={(val) => updateField(field.key, val)}
                    searchable
                  />
                );

              case 'variable':
                return (
                  <Select
                    key={field.key}
                    label="Variable"
                    description={description}
                    size="xs"
                    data={
                      variables?.map((s) => ({ value: s.name, label: s.name })) ?? []
                    }
                    value={String(currentValue ?? '')}
                    onChange={(val) => updateField(field.key, val)}
                    searchable
                  />
                );

              case 'map':
                return (
                  <JsonInput
                    key={field.key}
                    label={field.label}
                    description={description}
                    size="xs"
                    value={
                      typeof currentValue === 'object' && currentValue !== null
                        ? JSON.stringify(currentValue, null, 2)
                        : '{}'
                    }
                    onChange={(val) => {
                      try {
                        updateField(field.key, JSON.parse(val));
                      } catch {
                        // Ignore parse errors while user is typing.
                      }
                    }}
                    minRows={3}
                    formatOnBlur
                    placeholder='{"key": "value"}'
                  />
                );

              case 'literal': {
                const rawType = node.data.valueType;
                const valueType: LiteralType =
                  rawType === 'integer' || rawType === 'boolean'
                    ? rawType
                    : 'string';

                const handleTypeChange = (next: string) => {
                  const nextType = next as LiteralType;
                  let nextValue: unknown = currentValue;
                  // Coerce the existing value into the new type so we
                  // never leave the node in an inconsistent state.
                  if (nextType === 'string') {
                    nextValue =
                      currentValue == null ? '' : String(currentValue);
                  } else if (nextType === 'integer') {
                    const n = Number(currentValue);
                    nextValue = Number.isFinite(n) ? Math.trunc(n) : 0;
                  } else if (nextType === 'boolean') {
                    nextValue = Boolean(currentValue);
                  }
                  updateFields({
                    valueType: nextType,
                    [field.key]: nextValue,
                  });
                };

                return (
                  <Stack key={field.key} gap={4}>
                    <Text size="xs" fw={500}>
                      {field.label}
                    </Text>
                    {description && (
                      <Text size="xs" c="dimmed">
                        {description}
                      </Text>
                    )}
                    <SegmentedControl
                      size="xs"
                      value={valueType}
                      onChange={handleTypeChange}
                      data={[
                        { value: 'string', label: 'String' },
                        { value: 'integer', label: 'Integer' },
                        { value: 'boolean', label: 'Boolean' },
                      ]}
                    />
                    {valueType === 'string' && (
                      <TextInput
                        size="xs"
                        value={String(currentValue ?? '')}
                        onChange={(e) =>
                          updateField(field.key, e.target.value)
                        }
                      />
                    )}
                    {valueType === 'integer' && (
                      <NumberInput
                        size="xs"
                        value={
                          typeof currentValue === 'number'
                            ? currentValue
                            : Number(currentValue ?? 0)
                        }
                        onChange={(val) => updateField(field.key, val)}
                      />
                    )}
                    {valueType === 'boolean' && (
                      <Switch
                        size="xs"
                        checked={Boolean(currentValue)}
                        onChange={(e) =>
                          updateField(field.key, e.currentTarget.checked)
                        }
                        label={currentValue ? 'true' : 'false'}
                      />
                    )}
                  </Stack>
                );
              }

              default:
                return null;
            }
          })}
        </>
      )}

      <Divider label="Ports" labelPosition="center" />
      {nodeInfo.inputs.length > 0 && (
        <Stack gap={2}>
          <Text size="xs" fw={500}>
            Inputs
          </Text>
          {nodeInfo.inputs.map((port) => (
            <Text key={port.id} size="xs" c="dimmed">
              {port.label} ({port.type})
            </Text>
          ))}
        </Stack>
      )}
      {nodeInfo.outputs.length > 0 && (
        <Stack gap={2}>
          <Text size="xs" fw={500}>
            Outputs
          </Text>
          {nodeInfo.outputs.map((port) => (
            <Text key={port.id} size="xs" c="dimmed">
              {port.label} ({port.type})
            </Text>
          ))}
        </Stack>
      )}

      <Divider />
      <Button color="red" variant="light" size="xs" onClick={() => onDeleteNode(node.id)}>
        Delete Node
      </Button>
    </Stack>
  );
}
