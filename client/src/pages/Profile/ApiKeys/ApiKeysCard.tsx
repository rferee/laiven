import { useState } from 'react';
import {
  Card, Group, Text, Title, Button, Stack, Center, Table, Badge, Skeleton, Alert, Code,
  ActionIcon, Tooltip,
} from '@mantine/core';
import { IconKey, IconPlus, IconAlertCircle, IconTrash } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { getApiKeys, deleteApiKey, type ApiKey, type ApiKeyCreateResponse } from '@/api/auth';
import { getProjects, type Project } from '@/api/projects';
import { formatRelative } from '@/utils/format';
import { getApiErrorMessage } from '@/utils/errors';
import CreateApiKeyModal from './CreateApiKeyModal';
import RevealApiKeyModal from './RevealApiKeyModal';

function ScopeCell({ apiKey, projects }: { apiKey: ApiKey; projects: Project[] }) {
  if (!apiKey.projectId) {
    return <Badge variant="light" color="gray">All projects</Badge>;
  }
  const project = projects.find((p) => p.id === apiKey.projectId);
  const projectLabel = project?.name ?? 'Project deleted';
  const projectColor = project ? undefined : 'gray';
  return (
    <Group gap={4} wrap="nowrap">
      <Badge variant="light" color={projectColor}>{projectLabel}</Badge>
      {apiKey.role && <Badge variant="outline" size="sm">{apiKey.role}</Badge>}
    </Group>
  );
}

export default function ApiKeysCard() {
  const { data: keys, isLoading, error, refetch } = useQuery({
    queryKey: ['api-keys'],
    queryFn: getApiKeys,
  });
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });
  const projects = projectsData?.items ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<ApiKeyCreateResponse | null>(null);

  const queryClient = useQueryClient();
  const revokeMutation = useMutation({
    mutationFn: (id: string) => deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      notifications.show({ color: 'green', message: 'API key revoked.' });
    },
    onError: (err: unknown) => {
      notifications.show({
        color: 'red',
        title: 'Revoke failed',
        message: getApiErrorMessage(err, 'Could not revoke the key.'),
      });
    },
  });

  function confirmRevoke(key: ApiKey) {
    modals.openConfirmModal({
      title: 'Revoke API key',
      children: (
        <Text size="sm">
          Revoke <strong>{key.name}</strong>? Any service using it will stop working immediately.
        </Text>
      ),
      labels: { confirm: 'Revoke', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => revokeMutation.mutate(key.id),
    });
  }

  return (
    <>
      <Card withBorder radius="md" padding="lg">
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <IconKey size={18} />
          <Title order={4}>API Keys</Title>
        </Group>
        <Button
          leftSection={<IconPlus size={14} />}
          size="sm"
          onClick={() => setCreateOpen(true)}
        >
          Create API key
        </Button>
      </Group>

      {isLoading ? (
        <Stack gap="xs">
          <Skeleton height={28} />
          <Skeleton height={28} />
          <Skeleton height={28} />
        </Stack>
      ) : error ? (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          <Group justify="space-between">
            <Text size="sm">{getApiErrorMessage(error, 'Failed to load API keys.')}</Text>
            <Button size="xs" variant="light" onClick={() => refetch()}>Retry</Button>
          </Group>
        </Alert>
      ) : !keys || keys.length === 0 ? (
        <Center py="lg">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">No API keys yet</Text>
            <Text size="xs" c="dimmed">
              Create one to authenticate programmatic access.
            </Text>
          </Stack>
        </Center>
      ) : (
        <Table verticalSpacing="xs" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Prefix</Table.Th>
              <Table.Th>Scope</Table.Th>
              <Table.Th>Last used</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th style={{ width: 64 }}></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {keys.map((key) => (
              <Table.Tr key={key.id}>
                <Table.Td><Text size="sm" fw={500}>{key.name}</Text></Table.Td>
                <Table.Td><Code>{key.keyPrefix}</Code></Table.Td>
                <Table.Td><ScopeCell apiKey={key} projects={projects} /></Table.Td>
                <Table.Td>
                  <Text size="sm" c={key.lastUsedAt ? undefined : 'dimmed'}>
                    {key.lastUsedAt ? formatRelative(key.lastUsedAt) : 'Never'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">{formatRelative(key.createdAt)}</Text>
                </Table.Td>
                <Table.Td>
                  <Tooltip label="Revoke API key">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Revoke API key"
                      onClick={() => confirmRevoke(key)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      </Card>

      <CreateApiKeyModal
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(key) => setRevealedKey(key)}
      />

      <RevealApiKeyModal
        apiKey={revealedKey}
        onClose={() => setRevealedKey(null)}
      />
    </>
  );
}
