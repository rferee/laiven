import { Group, Stack, Title, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({ icon, title, description, actions }: PageHeaderProps) {
  const left = (
    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
      {icon}
      <Stack gap={0} style={{ minWidth: 0 }}>
        <Title order={2}>{title}</Title>
        {description && <Text size="sm" c="dimmed">{description}</Text>}
      </Stack>
    </Group>
  );

  if (!actions) return left;

  return (
    <Group justify="space-between" align="center" wrap="nowrap">
      {left}
      {actions}
    </Group>
  );
}
