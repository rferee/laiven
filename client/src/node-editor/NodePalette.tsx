import { useMemo, useState } from 'react';
import {
  Accordion,
  Text,
  Stack,
  Paper,
  Badge,
  Group,
  TextInput,
  Tooltip,
  Loader,
  Center,
} from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useNodeTypes } from './useNodeTypes';
import type { NodeTypeInfo, NodeCategory } from './types';

interface NodePaletteProps {
  onAddNode: (nodeType: NodeTypeInfo) => void;
}

const categoryColors: Record<string, string> = {
  Input: '#8880F0',         // atlantis blue
  Condition: '#E89768',     // sunset orange
  Transform: '#97d47d',     // elven green
  'Flow Control': '#8880F0', // atlantis blue
  Logic: '#e56767',         // dragonblood red
};

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const { categories, isLoading } = useNodeTypes();
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo<NodeCategory[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        nodes: cat.nodes.filter((node) => {
          return (
            node.label.toLowerCase().includes(q) ||
            node.type.toLowerCase().includes(q) ||
            node.category.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((cat) => cat.nodes.length > 0);
  }, [categories, search]);

  // When searching, expand every visible category so matches are visible.
  // Otherwise use the natural default (all categories expanded).
  const accordionValue = useMemo(
    () => filteredCategories.map((c) => c.name),
    [filteredCategories],
  );

  return (
    <Stack gap={0} style={{ height: '100%', overflow: 'auto' }}>
      <Stack
        gap="xs"
        p="sm"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Text fw={600} size="sm">
          Node Palette
        </Text>
        <TextInput
          size="xs"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          leftSection={<IconSearch size={14} />}
        />
      </Stack>

      {isLoading ? (
        <Center p="xl">
          <Loader size="sm" />
        </Center>
      ) : filteredCategories.length === 0 ? (
        <Center p="xl">
          <Text size="xs" c="dimmed">
            No matching nodes
          </Text>
        </Center>
      ) : (
        <Accordion
          multiple
          value={accordionValue}
          // Expanded state is fully controlled from `value`; onChange is a
          // no-op because filtering drives which categories are open.
          onChange={() => {}}
          variant="filled"
          styles={{ content: { padding: '4px 8px' } }}
        >
          {filteredCategories.map((category) => (
            <Accordion.Item key={category.name} value={category.name}>
              <Accordion.Control>
                <Group gap={8}>
                  <Badge size="xs" color={categoryColors[category.name]}>
                    {category.nodes.length}
                  </Badge>
                  <Text size="sm" fw={500}>
                    {category.name}
                  </Text>
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap={4}>
                  {category.nodes.map((node) => (
                    <Tooltip
                      key={node.type}
                      label={node.description || node.label}
                      position="right"
                      multiline
                      w={260}
                      withArrow
                      openDelay={300}
                    >
                      <Paper
                        p="xs"
                        withBorder
                        style={{
                          cursor: 'grab',
                          transition: 'all 0.15s',
                          borderLeft: `3px solid ${categoryColors[category.name] ?? '#868e96'}`,
                        }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            'application/laiven-node',
                            JSON.stringify(node),
                          );
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={() => onAddNode(node)}
                      >
                        <Text size="xs" fw={500}>
                          {node.label}
                        </Text>
                        {node.description && (
                          <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                            {node.description}
                          </Text>
                        )}
                        <Group gap={4} mt={2}>
                          {node.inputs.length > 0 && (
                            <Text size="xs" c="dimmed">
                              {node.inputs.length} in
                            </Text>
                          )}
                          {node.outputs.length > 0 && (
                            <Text size="xs" c="dimmed">
                              {node.outputs.length} out
                            </Text>
                          )}
                        </Group>
                      </Paper>
                    </Tooltip>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </Stack>
  );
}
