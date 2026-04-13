import { Button, Group, Paper, Text, Transition } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export interface BulkAction {
  label: string;
  color?: string;
  icon?: ReactNode;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface BulkSelectionToolbarProps {
  count: number;
  /** Singular noun — pluralised with an `s` when count !== 1. E.g. "word", "user". */
  noun: string;
  onClear: () => void;
  actions: BulkAction[];
}

export default function BulkSelectionToolbar({
  count,
  noun,
  onClear,
  actions,
}: BulkSelectionToolbarProps) {
  return (
    <Transition mounted={count > 0} transition="slide-down" duration={200}>
      {(styles) => (
        <Paper withBorder radius="md" p="sm" shadow="sm" style={styles}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={500}>
              {count} {noun}{count !== 1 ? 's' : ''} selected
            </Text>
            <Group gap="xs" wrap="nowrap">
              {actions.map((a, i) => (
                <Button
                  key={i}
                  size="xs"
                  color={a.color}
                  leftSection={a.icon}
                  onClick={a.onClick}
                  loading={a.loading}
                  disabled={a.disabled}
                >
                  {a.label}
                </Button>
              ))}
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<IconX size={14} />}
                onClick={onClear}
              >
                Clear
              </Button>
            </Group>
          </Group>
        </Paper>
      )}
    </Transition>
  );
}
