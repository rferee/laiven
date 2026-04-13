import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Group,
  Title,
  Button,
  Loader,
  Center,
  Text,
  Stack,
  Badge,
  Popover,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconLink } from '@tabler/icons-react';
import { NodeGraphEditor, type NodeGraphEditorHandle } from '@/node-editor/NodeGraphEditor';
import apiClient from '@/api/client';
import type { NodeGraph } from '@/node-editor/types';
import type { Rule, RuleUsage } from '@/api/rules';

type EditorKind = 'rule' | 'builder';

export default function NodeEditorPage() {
  const params = useParams<{
    projectId: string;
    ruleId?: string;
    builderId?: string;
  }>();
  const { projectId, ruleId, builderId } = params;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  let kind: EditorKind;
  let entityId: string | undefined;
  let endpoint: string;
  let testEndpoint: string;
  let invalidateKey: readonly unknown[];

  if (ruleId) {
    kind = 'rule';
    entityId = ruleId;
    endpoint = `/projects/${projectId}/rules/${ruleId}`;
    testEndpoint = `/projects/${projectId}/rules/${ruleId}/test`;
    invalidateKey = ['projects', projectId, 'rules'];
  } else {
    kind = 'builder';
    entityId = builderId;
    endpoint = `/projects/${projectId}/builders/${builderId}`;
    testEndpoint = `/projects/${projectId}/builders/${builderId}/test`;
    invalidateKey = ['projects', projectId, 'builders'];
  }

  const graphMode = kind === 'builder' ? ('builder' as const) : ('rule' as const);
  const editorRef = useRef<NodeGraphEditorHandle>(null);

  // Fetch the entity
  const { data: entity, isLoading } = useQuery({
    queryKey: ['node-editor', kind, projectId, entityId],
    queryFn: async () => {
      const res = await apiClient.get(endpoint);
      return res.data;
    },
    enabled: !!entityId && entityId !== 'new',
  });

  // Fetch attributes and value sets for the node inspector
  const { data: attributes } = useQuery({
    queryKey: ['attributes', projectId],
    queryFn: async () => {
      const res = await apiClient.get(`/projects/${projectId}/attributes`);
      return res.data.items;
    },
  });

  const { data: variablesData } = useQuery({
    queryKey: ['variables', projectId],
    queryFn: async () => {
      const res = await apiClient.get(`/projects/${projectId}/variables`);
      return res.data.items;
    },
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (graph: NodeGraph) => {
      const payload = { graph };
      const res = await apiClient.put(endpoint, payload);
      return res.data;
    },
    onSuccess: () => {
      notifications.show({ title: 'Saved', message: 'Graph saved successfully', color: 'green' });
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      queryClient.invalidateQueries({ queryKey: ['node-editor', kind, projectId, entityId] });
    },
    onError: () => {
      notifications.show({ title: 'Error', message: 'Failed to save graph', color: 'red' });
    },
  });

  // Test execution
  const handleTest = async (attributeValues: Record<string, unknown>) => {
    const res = await apiClient.post(testEndpoint, { attributeValues });
    return res.data;
  };

  if (isLoading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  const kindLabel = kind === 'rule' ? 'Rule' : 'Builder';
  const ruleEntity = kind === 'rule' ? (entity as Rule | undefined) : undefined;
  const usage: RuleUsage | undefined = ruleEntity?.usage;
  const usageCount =
    (usage?.asWordRule ? 1 : 0) + (usage?.derivativeTypes?.length ?? 0);
  const showUsageBanner = kind === 'rule' && usageCount > 0;

  return (
    <Stack gap={0} h="100vh">
      <Group
        p="sm"
        justify="space-between"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Group gap="sm" align="center">
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconArrowLeft size={14} />}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
          <Title order={4}>{entity?.name || `New ${kindLabel}`}</Title>
          <Text size="sm" c="dimmed" lh={1}>
            {kindLabel} Editor
          </Text>
        {showUsageBanner && usage && (
          <Popover position="bottom-start" withArrow shadow="md" width={280}>
            <Popover.Target>
              <UnstyledButton>
                <Badge
                  size="sm"
                  variant="light"
                  color="sunset"
                  leftSection={<IconLink size={11} />}
                  style={{ cursor: 'pointer' }}
                >
                  Used by {usageCount} place{usageCount !== 1 ? 's' : ''}
                </Badge>
              </UnstyledButton>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  Changes to this rule affect every place it is linked.
                </Text>
                <Group gap={6}>
                  {usage.asWordRule && (
                    <Badge size="sm" variant="light" color="blue">
                      Word rule
                      {usage.asWordRule.required ? ' (required)' : ''}
                    </Badge>
                  )}
                  {usage.derivativeTypes.map((dt) => (
                    <Badge key={dt.id} size="sm" variant="light" color="atlantis">
                      {dt.name}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Popover.Dropdown>
          </Popover>
        )}
        </Group>
        <Group gap="sm">
          <Button
            variant="default"
            size="xs"
            onClick={() => editorRef.current?.toggleTest()}
          >
            Test Mode
          </Button>
          <Button
            size="xs"
            style={{ background: '#97d47d', color: '#0D1014', border: 'none' }}
            onClick={() => editorRef.current?.save()}
          >
            Save Graph
          </Button>
        </Group>
      </Group>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <NodeGraphEditor
          ref={editorRef}
          mode={graphMode}
          initialGraph={entity?.graph}
          attributes={
            Array.isArray(attributes)
              ? attributes.map(
                  (a: { identifier: string; name: string; type: string }) => ({
                    identifier: a.identifier,
                    name: a.name,
                    type: a.type,
                  }),
                )
              : []
          }
          variables={
            Array.isArray(variablesData)
              ? variablesData.map((s: { name: string }) => ({ name: s.name }))
              : []
          }
          onSave={(graph) => saveMutation.mutate(graph)}
          onTest={entityId !== 'new' ? handleTest : undefined}
        />
      </div>
    </Stack>
  );
}
