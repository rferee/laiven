import { Modal, Stack, Alert, TextInput, Button, Group, ActionIcon, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCopy } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { ApiKeyCreateResponse } from '@/api/auth';

interface RevealApiKeyModalProps {
  apiKey: ApiKeyCreateResponse | null;
  onClose: () => void;
}

export default function RevealApiKeyModal({ apiKey, onClose }: RevealApiKeyModalProps) {
  async function copy() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey.key);
      notifications.show({ color: 'green', message: 'API key copied to clipboard.' });
    } catch {
      notifications.show({
        color: 'red',
        message: "Couldn't copy — select and copy the key manually.",
      });
    }
  }

  return (
    <Modal
      opened={!!apiKey}
      onClose={onClose}
      title="API key created"
      size="lg"
      centered
      closeOnClickOutside={false}
      withCloseButton={false}
    >
      {apiKey && (
        <Stack gap="md">
          <Alert
            icon={<IconAlertTriangle size={18} />}
            color="yellow"
            variant="light"
          >
            This is the only time the full key is shown. Copy it now — it cannot be
            retrieved later.
          </Alert>

          <TextInput
            label="API key"
            value={apiKey.key}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            rightSection={
              <Tooltip label="Copy">
                <ActionIcon variant="subtle" aria-label="Copy" onClick={copy}>
                  <IconCopy size={16} />
                </ActionIcon>
              </Tooltip>
            }
          />

          <Group justify="flex-end">
            <Button onClick={onClose}>Got it</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
