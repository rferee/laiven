import { Card, Stack, Text, Button } from '@mantine/core';
import type { ReactNode } from 'react';

interface EmptyStateCardProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
  };
}

export default function EmptyStateCard({ icon, title, description, action }: EmptyStateCardProps) {
  return (
    <Card withBorder radius="md" padding="md">
      <Stack align="center" gap="sm" py="lg">
        {icon}
        <Text c="dimmed" size="lg" fw={500}>{title}</Text>
        {description && (
          <Text c="dimmed" size="sm" ta="center" maw={420}>
            {description}
          </Text>
        )}
        {action && (
          <Button variant="light" leftSection={action.icon} onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
