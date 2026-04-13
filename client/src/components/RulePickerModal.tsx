import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Modal,
  Stack,
  TextInput,
  ScrollArea,
  UnstyledButton,
  Group,
  Text,
  Badge,
  Button,
  Divider,
  Loader,
  Center,
  Box,
} from '@mantine/core';
import { IconPlus, IconSearch, IconRuler } from '@tabler/icons-react';
import { getRules, type Rule } from '@/api/rules';

interface RulePickerModalProps {
  opened: boolean;
  onClose: () => void;
  onPick: (ruleId: string) => void;
  onCreateNew: () => void;
  excludeRuleIds: string[];
  title?: string;
}

export default function RulePickerModal({
  opened,
  onClose,
  onPick,
  onCreateNew,
  excludeRuleIds,
  title = 'Add rule from library',
}: RulePickerModalProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects', projectId, 'rules'],
    queryFn: () => getRules(projectId!),
    enabled: !!projectId && opened,
  });

  const excludeSet = useMemo(() => new Set(excludeRuleIds), [excludeRuleIds]);

  const filteredRules = useMemo(() => {
    const all = data?.items ?? [];
    const needle = search.trim().toLowerCase();
    return all
      .filter((r) => !excludeSet.has(r.id))
      .filter((r) => {
        if (!needle) return true;
        const name = r.name.toLowerCase();
        const desc = (r.description ?? '').toLowerCase();
        return name.includes(needle) || desc.includes(needle);
      });
  }, [data, excludeSet, search]);

  const handlePick = (rule: Rule) => {
    onPick(rule.id);
    onClose();
  };

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={title}
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        <TextInput
          placeholder="Search rules by name or description"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          autoFocus
        />

        <Box style={{ minHeight: 220 }}>
          {isLoading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : filteredRules.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <IconRuler size={36} stroke={1} color="var(--mantine-color-dimmed)" />
                <Text size="sm" c="dimmed">
                  {search
                    ? 'No rules match your search.'
                    : excludeRuleIds.length > 0 && (data?.items?.length ?? 0) > 0
                      ? 'All library rules are already linked here.'
                      : 'No rules in the library yet.'}
                </Text>
              </Stack>
            </Center>
          ) : (
            <Stack gap={6}>
              {filteredRules.map((rule) => {
                const hasUsage =
                  !!rule.usage?.asWordRule ||
                  (rule.usage?.derivativeTypes?.length ?? 0) > 0;
                return (
                  <UnstyledButton
                    key={rule.id}
                    onClick={() => handlePick(rule)}
                    p="sm"
                    style={{
                      border: '1px solid var(--mantine-color-default-border)',
                      borderRadius: 'var(--mantine-radius-sm)',
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Group gap={8} wrap="nowrap">
                          <Text size="sm" fw={500} truncate>
                            {rule.name}
                          </Text>
                          {!rule.enabled && (
                            <Badge size="xs" variant="light" color="gray">
                              Disabled
                            </Badge>
                          )}
                          {hasUsage && (
                            <Badge size="xs" variant="light" color="blue">
                              In use
                            </Badge>
                          )}
                        </Group>
                        {rule.description && (
                          <Text size="xs" c="dimmed" lineClamp={2}>
                            {rule.description}
                          </Text>
                        )}
                      </Stack>
                    </Group>
                  </UnstyledButton>
                );
              })}
            </Stack>
          )}
        </Box>

        <Divider />
        <Group justify="space-between">
          <Button variant="default" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            onClick={() => {
              handleClose();
              onCreateNew();
            }}
          >
            Create new rule
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
