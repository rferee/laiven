import { Modal, Stack, Alert, Text, Group, Button } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/utils/errors';

interface DeleteConfirmModalProps<TVariables> {
  /** When non-null, the modal is open and `itemName` is derived from `target`. */
  target: { id: string; name?: string } | null;
  onClose: () => void;
  /** e.g. "Attribute", "Variable". Used for title + button copy. */
  entityLabel: string;
  /** Dimmed warning text above the mutation error alert. */
  warning?: ReactNode;
  /** Optional extra content (e.g. a usage list) shown between the warning and the mutation error alert. */
  extraContent?: ReactNode;
  /** The delete mutation so the modal can show pending/error state and call mutate. */
  mutation: Pick<UseMutationResult<unknown, unknown, TVariables>, 'isPending' | 'isError' | 'error'>;
  /** Called when user confirms. Receive no args; caller binds `target.id`. */
  onConfirm: () => void;
}

export default function DeleteConfirmModal<TVariables>({
  target,
  onClose,
  entityLabel,
  warning,
  extraContent,
  mutation,
  onConfirm,
}: DeleteConfirmModalProps<TVariables>) {
  return (
    <Modal
      opened={!!target}
      onClose={onClose}
      title={`Delete ${entityLabel}`}
      size="md"
      centered
    >
      {target && (
        <Stack gap="md">
          <Text size="sm">
            Delete <strong>{target.name ?? 'this item'}</strong>?
          </Text>

          {warning && (
            <Alert icon={<IconAlertTriangle size={16} />} color="sunset" variant="light">
              {warning}
            </Alert>
          )}

          {extraContent}

          {mutation.isError && (
            <Alert color="red" variant="light">
              {getApiErrorMessage(mutation.error, `Failed to delete ${entityLabel.toLowerCase()}.`)}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button color="red" onClick={onConfirm} loading={mutation.isPending}>
              Delete
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
