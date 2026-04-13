import { useState } from 'react';
import { Stack, Text, TextInput, Button, Group, Paper, Badge, Divider, Code, Alert } from '@mantine/core';
import { IconPlayerPlay, IconCheck, IconX } from '@tabler/icons-react';
import type { TraceStep, EditorMode } from './types';

interface TestPanelProps {
  mode: EditorMode;
  attributes: Array<{ identifier: string; name: string; type: string }>;
  onRun: (attributeValues: Record<string, unknown>) => Promise<{
    pass?: boolean;
    value?: string | null;
    trace: TraceStep[];
    message?: string;
  }>;
  onTraceUpdate: (trace: TraceStep[]) => void;
}

export function TestPanel({ mode, attributes, onRun, onTraceUpdate }: TestPanelProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    pass?: boolean;
    value?: string | null;
    trace: TraceStep[];
    message?: string;
  } | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try {
      const attrValues: Record<string, unknown> = {};
      for (const attr of attributes) {
        const raw = values[attr.identifier] ?? '';
        if (attr.type === 'integer') attrValues[attr.identifier] = raw ? parseInt(raw) : null;
        else if (attr.type === 'boolean') attrValues[attr.identifier] = raw === 'true';
        else attrValues[attr.identifier] = raw || null;
      }

      const res = await onRun(attrValues);
      setResult(res);
      onTraceUpdate(res.trace);
    } catch (err) {
      setResult({ trace: [], message: 'Execution failed' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Stack gap="sm" p="sm" style={{ height: '100%', overflow: 'auto' }}>
      <Group justify="space-between">
        <Text fw={600} size="sm">Test Mode</Text>
        <Button
          size="xs"
          leftSection={<IconPlayerPlay size={14} />}
          onClick={handleRun}
          loading={running}
        >
          Run
        </Button>
      </Group>

      <Divider label="Sample Values" labelPosition="center" />

      <Stack gap={4}>
        {attributes.map(attr => (
          <TextInput
            key={attr.identifier}
            label={attr.name}
            size="xs"
            value={values[attr.identifier] ?? ''}
            onChange={(e) => setValues(prev => ({ ...prev, [attr.identifier]: e.target.value }))}
            placeholder={`Enter ${attr.type} value...`}
          />
        ))}
      </Stack>

      {result && (
        <>
          <Divider label="Result" labelPosition="center" />

          {mode === 'rule' && (
            <Alert
              color={result.pass ? 'green' : 'red'}
              icon={result.pass ? <IconCheck size={16} /> : <IconX size={16} />}
              title={result.pass ? 'PASS' : 'FAIL'}
            >
              {result.message && <Text size="sm">{result.message}</Text>}
            </Alert>
          )}

          {mode === 'builder' && (
            <Paper p="xs" withBorder>
              <Text size="xs" c="dimmed">Generated Value:</Text>
              <Code block>{result.value ?? '(empty)'}</Code>
            </Paper>
          )}

          <Divider label="Trace" labelPosition="center" />

          <Stack gap={4}>
            {result.trace.map((step, i) => (
              <Paper key={i} p="xs" withBorder style={{
                borderLeft: `3px solid ${
                  step.status === 'success' ? '#40c057' :
                  step.status === 'error' ? '#fa5252' : '#868e96'
                }`,
              }}>
                <Group gap={4} justify="space-between">
                  <Text size="xs" fw={500}>{step.nodeType}</Text>
                  <Badge size="xs" color={
                    step.status === 'success' ? 'green' :
                    step.status === 'error' ? 'red' : 'gray'
                  }>{step.status}</Badge>
                </Group>
                {step.status === 'success' && step.outputs.output !== undefined && (
                  <Text size="xs" c="dimmed" truncate>
                    → {formatValue(step.outputs.output)}
                  </Text>
                )}
                {step.error && (
                  <Text size="xs" c="red">{step.error}</Text>
                )}
              </Paper>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
