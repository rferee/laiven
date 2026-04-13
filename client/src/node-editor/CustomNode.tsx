import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Paper, Text, Stack, Badge, Group, Tooltip } from '@mantine/core';
import { useNodeTypes } from './useNodeTypes';
import type { TraceStep } from './types';

const portTypeColors: Record<string, string> = {
  string: '#8880F0',   // atlantis
  boolean: '#E89768',  // sunset
  number: '#97d47d',   // elven
  any: '#D3D3D3',      // body text
  array: '#8880F0',    // atlantis
};

const categoryColors: Record<string, string> = {
  Input: '#8880F0',         // atlantis blue
  Condition: '#E89768',     // sunset orange
  Transform: '#97d47d',     // elven green
  'Flow Control': '#8880F0', // atlantis blue
  Logic: '#e56767',         // dragonblood red
};

interface CustomNodeData {
  [key: string]: unknown;
  _traceStep?: TraceStep;
}

function CustomNode({ data, type, selected }: NodeProps & { type: string }) {
  const { getNodeTypeInfo } = useNodeTypes();
  const nodeInfo = getNodeTypeInfo(type);
  const traceStep = (data as CustomNodeData)?._traceStep as TraceStep | undefined;

  if (!nodeInfo) {
    return (
      <Paper p="xs" shadow="sm" withBorder>
        <Text size="xs" c="red">
          Unknown: {type}
        </Text>
      </Paper>
    );
  }

  const categoryColor = categoryColors[nodeInfo.category] || '#868e96';

  let borderColor = selected ? '#E89768' : 'var(--mantine-color-default-border)';
  let bgColor = 'var(--mantine-color-body)';

  if (traceStep) {
    if (traceStep.status === 'success') {
      borderColor = '#40c057';
      bgColor = 'rgba(64, 192, 87, 0.08)';
    } else if (traceStep.status === 'error') {
      borderColor = '#fa5252';
      bgColor = 'rgba(250, 82, 82, 0.08)';
    } else if (traceStep.status === 'skipped') {
      borderColor = '#868e96';
      bgColor = 'rgba(134, 142, 150, 0.05)';
    }
  }

  const traceInputEntries =
    traceStep && traceStep.status === 'success' && traceStep.inputs
      ? Object.entries(traceStep.inputs)
      : [];

  return (
    <Paper
      shadow="sm"
      p={0}
      style={{
        border: `2px solid ${borderColor}`,
        borderRadius: 0,
        minWidth: 180,
        backgroundColor: bgColor,
        fontSize: 12,
      }}
    >
      {/* Header */}
      <Tooltip
        label={nodeInfo.description || nodeInfo.label}
        position="top"
        multiline
        w={260}
        withArrow
        openDelay={400}
      >
        <div
          style={{
            background: categoryColor,
            padding: '4px 10px',
            borderRadius: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text size="xs" fw={600} c="white">
            {nodeInfo.label}
          </Text>
          <Badge size="xs" variant="white" color={categoryColor}>
            {nodeInfo.category}
          </Badge>
        </div>
      </Tooltip>

      {/* Trace output */}
      {traceStep && traceStep.status === 'success' && (
        <div
          style={{
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.03)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          {traceInputEntries.length > 0 && (
            <Stack gap={0} mb={2}>
              <Text size="xs" fw={600} c="dimmed">
                Inputs
              </Text>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 11,
                }}
              >
                <tbody>
                  {traceInputEntries.map(([key, value]) => (
                    <tr key={key}>
                      <td
                        style={{
                          color: 'var(--mantine-color-dimmed)',
                          paddingRight: 6,
                          verticalAlign: 'top',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {key}:
                      </td>
                      <td
                        style={{
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          wordBreak: 'break-all',
                          maxWidth: 160,
                        }}
                      >
                        {formatTraceValue(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Stack>
          )}
          <Text size="xs" c="dimmed" truncate>
            <Text component="span" size="xs" fw={600} c="dimmed">
              Output:{' '}
            </Text>
            {formatTraceValue(traceStep.outputs?.output ?? traceStep.outputs)}
          </Text>
        </div>
      )}

      {/* Ports */}
      <div style={{ padding: '6px 10px', position: 'relative' }}>
        <Stack gap={2}>
          {nodeInfo.inputs.map((port) => (
            <Group key={port.id} gap={4} style={{ position: 'relative' }}>
              <Handle
                type="target"
                position={Position.Left}
                id={port.id}
                style={{
                  width: 10,
                  height: 10,
                  background: portTypeColors[port.type] || '#868e96',
                  border: '2px solid white',
                  left: -15,
                  top: 'auto',
                }}
              />
              <Tooltip label={`${port.type}`} position="left" withArrow>
                <Text size="xs" c="dimmed">
                  {port.label}
                </Text>
              </Tooltip>
            </Group>
          ))}
          {nodeInfo.outputs.map((port) => (
            <Group
              key={port.id}
              gap={4}
              justify="flex-end"
              style={{ position: 'relative' }}
            >
              <Tooltip label={`${port.type}`} position="right" withArrow>
                <Text size="xs" c="dimmed">
                  {port.label}
                </Text>
              </Tooltip>
              <Handle
                type="source"
                position={Position.Right}
                id={port.id}
                style={{
                  width: 10,
                  height: 10,
                  background: portTypeColors[port.type] || '#868e96',
                  border: '2px solid white',
                  right: -15,
                  top: 'auto',
                }}
              />
            </Group>
          ))}
        </Stack>

        {/* Config preview */}
        {nodeInfo.configFields && nodeInfo.configFields.length > 0 && (
          <div
            style={{
              marginTop: 4,
              paddingTop: 4,
              borderTop: '1px solid var(--mantine-color-default-border)',
            }}
          >
            {nodeInfo.configFields.slice(0, 2).map((field) => {
              const val = (data as Record<string, unknown>)[field.key];
              if (val === undefined || val === null || val === '') return null;
              return (
                <Text key={field.key} size="xs" c="dimmed" truncate>
                  {field.label}:{' '}
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </Text>
              );
            })}
          </div>
        )}
      </div>
    </Paper>
  );
}

function formatTraceValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default memo(CustomNode);
