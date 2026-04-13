import { Fragment, useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  Pagination,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Collapse,
  Popover,
  UnstyledButton,
  Badge,
  Center,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import {
  IconSearch,
  IconPlus,
  IconFilter,
  IconFilterOff,
  IconTrash,
  IconColumns3,
  IconChevronUp,
  IconChevronDown,
  IconCheck,
  IconChevronRight,
} from '@tabler/icons-react';
import { getAttributes, type Attribute } from '@/api/attributes';
import { getDerivativeTypes } from '@/api/derivative-types';
import {
  getWords,
  searchWords,
  deleteWord,
  type WordListItem,
  type SearchQuery,
} from '@/api/words';
import AdvancedSearchBuilder, {
  type SearchGroupNode,
  createEmptyGroup,
  buildSearchConditions,
} from '@/components/AdvancedSearchBuilder';
import PageHeader from '@/components/PageHeader';
import SkeletonList from '@/components/SkeletonList';
import EmptyStateCard from '@/components/EmptyStateCard';
import LoadErrorAlert from '@/components/LoadErrorAlert';
import BulkSelectionToolbar from '@/components/BulkSelectionToolbar';

interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

export default function WordSearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchText, setSearchText] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchText, 300);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedQuery, setAdvancedQuery] = useState<SearchGroupNode>(createEmptyGroup());

  const [sort, setSort] = useState<SortState | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [columnPopoverOpen, setColumnPopoverOpen] = useState(false);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const {
    data: attributesData,
    isLoading: attributesLoading,
    error: attributesError,
    refetch: refetchAttributes,
  } = useQuery({
    queryKey: ['attributes', projectId],
    queryFn: () => getAttributes(projectId!),
    enabled: !!projectId,
  });

  const { data: derivativeTypesData } = useQuery({
    queryKey: ['derivative-types', projectId],
    queryFn: () => getDerivativeTypes(projectId!),
    enabled: !!projectId,
  });

  const attributes = attributesData?.items ?? [];
  const derivativeTypes = derivativeTypesData?.items ?? [];
  const visibleAttributes = attributes.filter((a) => !hiddenColumns.has(a.id));

  const isSearchActive = debouncedSearch.trim().length > 0 || advancedOpen;

  const searchQueryPayload = useMemo((): SearchQuery => {
    const query: SearchQuery = {
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };

    if (debouncedSearch.trim()) {
      query.text = debouncedSearch.trim();
    }

    if (advancedOpen) {
      const built = buildSearchConditions(advancedQuery, attributes);
      if (built?.conditions && built.conditions.length > 0) {
        query.conditions = built.conditions as unknown as SearchQuery['conditions'];
        query.logic = built.logic;
      }
    }

    if (sort) {
      query.sort = { field: sort.field, order: sort.order };
    }

    return query;
  }, [debouncedSearch, advancedOpen, advancedQuery, attributes, sort, page, pageSize]);

  const {
    data: searchData,
    isLoading: searchLoading,
    isFetching: searchFetching,
    error: searchError,
  } = useQuery({
    queryKey: ['words-search', projectId, searchQueryPayload],
    queryFn: () => searchWords(projectId!, searchQueryPayload),
    enabled: !!projectId && isSearchActive,
    placeholderData: keepPreviousData,
  });

  const {
    data: listData,
    isLoading: listLoading,
    isFetching: listFetching,
    error: listError,
  } = useQuery({
    queryKey: [
      'words-list',
      projectId,
      sort?.field,
      sort?.order,
      page,
      pageSize,
    ],
    queryFn: () =>
      getWords(projectId!, {
        offset: (page - 1) * pageSize,
        limit: pageSize,
        sort: sort?.field,
        order: sort?.order,
      }),
    enabled: !!projectId && !isSearchActive,
    placeholderData: keepPreviousData,
  });

  const activeData = isSearchActive ? searchData : listData;
  const isLoading = isSearchActive ? searchLoading : listLoading;
  const isFetching = isSearchActive ? searchFetching : listFetching;
  const error = isSearchActive ? searchError : listError;

  const displayedItems = activeData?.items ?? [];
  const totalItems = activeData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset page (and selection) when filters or sort change.
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, advancedOpen, advancedQuery, sort]);

  // If the current page index is now past the last page (e.g. after deletes
  // shrunk the total), step back to a valid page. keepPreviousData prevents
  // an empty flash while the new query resolves.
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const deleteMutation = useMutation({
    mutationFn: (wordId: string) => deleteWord(projectId!, wordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words-search', projectId] });
      queryClient.invalidateQueries({ queryKey: ['words-list', projectId] });
    },
  });

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;

    modals.openConfirmModal({
      title: 'Delete Selected Words',
      centered: true,
      children: (
        <Text size="sm">
          Are you sure you want to delete {selectedIds.size} word{selectedIds.size > 1 ? 's' : ''}? This action cannot be easily undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const ids = Array.from(selectedIds);
        try {
          await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
          notifications.show({
            title: 'Deleted',
            message: `${ids.length} word${ids.length > 1 ? 's' : ''} deleted successfully.`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
          setSelectedIds(new Set());
        } catch {
          notifications.show({
            title: 'Error',
            message: 'Failed to delete some words. Please try again.',
            color: 'red',
          });
        }
      },
    });
  }, [selectedIds, deleteMutation, projectId]);

  const handleSort = (field: string) => {
    setSort((prev) => {
      if (prev?.field === field) {
        if (prev.order === 'asc') return { field, order: 'desc' };
        return null;
      }
      return { field, order: 'asc' };
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedItems.length && displayedItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedItems.map((i) => i.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleColumn = (attrId: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(attrId)) {
        next.delete(attrId);
      } else {
        next.add(attrId);
      }
      return next;
    });
  };

  const toggleExpandRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getCellDisplay = (item: WordListItem, attr: Attribute): string => {
    const val = item.attributeValues[attr.identifier];
    if (val === null || val === undefined) return '';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  };

  const getSortIcon = (field: string) => {
    if (sort?.field !== field) return null;
    return sort.order === 'asc' ? (
      <IconChevronUp size={14} />
    ) : (
      <IconChevronDown size={14} />
    );
  };

  const handleRowClick = (wordId: string) => {
    navigate(`/projects/${projectId}/words/${wordId}`);
  };

  const handleNewWord = () => {
    navigate(`/projects/${projectId}/words/new`);
  };

  if (attributesLoading) {
    return (
      <Center py="xl">
        <Loader size="lg" color="atlantis" />
      </Center>
    );
  }

  if (attributesError) {
    return (
      <LoadErrorAlert
        title="Error loading attributes"
        error={attributesError}
        fallback="Failed to load project attributes. Please try again."
        onRetry={() => refetchAttributes()}
      />
    );
  }

  const allSelected = displayedItems.length > 0 && selectedIds.size === displayedItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < displayedItems.length;

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconSearch size={28} stroke={1.5} />}
        title="Words"
        description="Search, filter, and manage words in this project."
        actions={
          <Button
            size="sm"
            leftSection={<IconPlus size={16} />}
            onClick={handleNewWord}
          >
            New Word
          </Button>
        }
      />

      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          placeholder="Search words..."
          leftSection={<IconSearch size={16} />}
          value={searchText}
          onChange={(e) => setSearchText(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 200 }}
          rightSection={
            isFetching ? <Loader size="xs" /> : null
          }
        />
        <Button
          variant={advancedOpen ? 'filled' : 'light'}
          leftSection={advancedOpen ? <IconFilterOff size={16} /> : <IconFilter size={16} />}
          onClick={() => setAdvancedOpen((v) => !v)}
          color={advancedOpen ? 'indigo' : 'gray'}
        >
          {advancedOpen ? 'Hide Filters' : 'Advanced Search'}
        </Button>
        <Select
          label="Per page"
          data={['25', '50', '100', '250', '500']}
          value={String(pageSize)}
          onChange={(v) => {
            if (v === null) return;
            setPageSize(Number(v));
            setPage(1);
          }}
          w={110}
          allowDeselect={false}
        />
        <Pagination
          total={totalPages}
          value={page}
          onChange={setPage}
          size="sm"
        />
        <Popover
          opened={columnPopoverOpen}
          onChange={setColumnPopoverOpen}
          position="bottom-end"
          withArrow
        >
          <Popover.Target>
            <Tooltip label="Show/hide columns">
              <ActionIcon
                variant="light"
                size="lg"
                onClick={() => setColumnPopoverOpen((v) => !v)}
              >
                <IconColumns3 size={18} />
              </ActionIcon>
            </Tooltip>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs" p="xs">
              <Text size="sm" fw={600}>Visible Columns</Text>
              {attributes.map((attr) => (
                <Checkbox
                  key={attr.id}
                  label={attr.name}
                  checked={!hiddenColumns.has(attr.id)}
                  onChange={() => toggleColumn(attr.id)}
                  size="sm"
                />
              ))}
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Group>

      <Collapse in={advancedOpen}>
        <Box pt="xs">
          <AdvancedSearchBuilder
            attributes={attributes}
            rootGroup={advancedQuery}
            onQueryChange={setAdvancedQuery}
          />
        </Box>
      </Collapse>

      <BulkSelectionToolbar
        count={selectedIds.size}
        noun="word"
        onClear={() => setSelectedIds(new Set())}
        actions={[
          {
            label: 'Delete Selected',
            color: 'red',
            icon: <IconTrash size={14} />,
            onClick: handleBulkDelete,
            loading: deleteMutation.isPending,
          },
        ]}
      />

      {isLoading ? (
        <SkeletonList height={52} />
      ) : error ? (
        <LoadErrorAlert title="Error" error={error} fallback="Failed to load words. Please try again." />
      ) : displayedItems.length === 0 ? (
        <EmptyStateCard
          icon={<IconSearch size={48} stroke={1} color="var(--mantine-color-dimmed)" />}
          title={debouncedSearch.trim() || advancedOpen ? 'No words match your search' : 'No words yet'}
          description={
            !debouncedSearch.trim() && !advancedOpen
              ? 'Create your first word to start building your language.'
              : undefined
          }
          action={
            !debouncedSearch.trim() && !advancedOpen
              ? {
                  label: 'Create your first word',
                  icon: <IconPlus size={16} />,
                  onClick: handleNewWord,
                }
              : undefined
          }
        />
      ) : (
        <>
          <Card withBorder radius="md" p={0} style={{ overflow: 'auto' }}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 40 }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleSelectAll}
                      size="sm"
                    />
                  </Table.Th>
                  {derivativeTypes.length > 0 && (
                    <Table.Th style={{ width: 36 }} />
                  )}
                  {visibleAttributes.map((attr) => (
                    <Table.Th key={attr.id}>
                      <UnstyledButton
                        onClick={() => handleSort(attr.identifier)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <Text size="sm" fw={600}>
                          {attr.name}
                        </Text>
                        {getSortIcon(attr.identifier)}
                      </UnstyledButton>
                    </Table.Th>
                  ))}
                  <Table.Th>
                    <UnstyledButton
                      onClick={() => handleSort('createdAt')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Text size="sm" fw={600}>Created</Text>
                      {getSortIcon('createdAt')}
                    </UnstyledButton>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {displayedItems.map((item) => {
                  const isExpanded = expandedRows.has(item.id);
                  return (
                    <Fragment key={item.id}>
                      <Table.Tr
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          // Don't navigate when clicking checkbox or expand button
                          const target = e.target as HTMLElement;
                          if (
                            target.closest('input[type="checkbox"]') ||
                            target.closest('[data-expand-btn]')
                          ) {
                            return;
                          }
                          handleRowClick(item.id);
                        }}
                      >
                        <Table.Td onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            size="sm"
                          />
                        </Table.Td>
                        {derivativeTypes.length > 0 && (
                          <Table.Td onClick={(e) => e.stopPropagation()}>
                            <ActionIcon
                              data-expand-btn
                              variant="subtle"
                              size="xs"
                              color="gray"
                              onClick={() => toggleExpandRow(item.id)}
                            >
                              <IconChevronRight
                                size={14}
                                style={{
                                  transform: isExpanded ? 'rotate(90deg)' : 'none',
                                  transition: 'transform 150ms ease',
                                }}
                              />
                            </ActionIcon>
                          </Table.Td>
                        )}
                        {visibleAttributes.map((attr) => (
                          <Table.Td key={attr.id}>
                            <Text size="sm" lineClamp={1}>
                              {getCellDisplay(item, attr)}
                            </Text>
                          </Table.Td>
                        ))}
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                      {isExpanded && derivativeTypes.length > 0 && (
                        <Table.Tr key={`${item.id}-derivatives`}>
                          <Table.Td
                            colSpan={visibleAttributes.length + (derivativeTypes.length > 0 ? 3 : 2)}
                            style={{ backgroundColor: 'var(--mantine-color-dark-7, #f8f9fa)' }}
                          >
                            <Box px="md" py="xs">
                              <Text size="xs" fw={600} c="dimmed" mb="xs">
                                Derivatives
                              </Text>
                              <Group gap="md" wrap="wrap">
                                {derivativeTypes.map((dt) => {
                                  const deriv = (item as unknown as Record<string, unknown>).derivatives as
                                    | Array<{ derivativeTypeId: string; value: string | null; isUserModified?: boolean }>
                                    | undefined;
                                  const derivVal = deriv?.find(
                                    (d) => d.derivativeTypeId === dt.id,
                                  );
                                  return (
                                    <Badge
                                      key={dt.id}
                                      variant="light"
                                      color={derivVal?.isUserModified ? 'yellow' : 'gray'}
                                      size="sm"
                                    >
                                      {dt.name}: {derivVal?.value ?? '(none)'}
                                      {derivVal?.isUserModified ? ' *' : ''}
                                    </Badge>
                                  );
                                })}
                              </Group>
                            </Box>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>

          <Group justify="center" py="sm" gap="sm">
            <Pagination
              total={totalPages}
              value={page}
              onChange={setPage}
              size="sm"
            />
            <Text size="sm" c="dimmed">
              {totalItems} word{totalItems !== 1 ? 's' : ''} total
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
