import { Alert, Button, Group, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { getApiErrorMessage } from '@/utils/errors';

interface LoadErrorAlertProps {
  title?: string;
  error: unknown;
  fallback?: string;
  onRetry?: () => void;
}

export default function LoadErrorAlert({
  title = 'Error',
  error,
  fallback = 'Failed to load.',
  onRetry,
}: LoadErrorAlertProps) {
  return (
    <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light" title={title}>
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{getApiErrorMessage(error, fallback)}</Text>
        {onRetry && (
          <Button size="xs" variant="light" onClick={onRetry}>
            Retry
          </Button>
        )}
      </Group>
    </Alert>
  );
}
