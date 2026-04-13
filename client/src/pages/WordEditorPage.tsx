import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Collapse,
  Divider,
  Grid,
  Group,
  Loader,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconAsterisk,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconDeviceFloppy,
  IconHistory,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { getAttributes, type Attribute } from '@/api/attributes';
import { getDerivativeTypes, type DerivativeType } from '@/api/derivative-types';
import {
  getWord,
  createWord,
  updateWord,
  deleteWord,
  getWordVersions,
  getWordVersion,
  restoreWordVersion,
  setDerivativeValue,
  resetDerivative,
  type Word,
  type WordVersion,
  type DerivativeValue,
} from '@/api/words';
import {
  validateWordLive,
  type WordValidationResponse as LiveValidationResult,
} from '@/api/words-validate';
import LoadErrorAlert from '@/components/LoadErrorAlert';

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function changeTypeBadgeColor(ct: string): string {
  switch (ct) {
    case 'created':
      return 'green';
    case 'updated':
      return 'blue';
    case 'deleted':
      return 'red';
    case 'cascade':
      return 'atlantis';
    default:
      return 'gray';
  }
}

function changeTypeLabel(ct: string): string {
  return ct === 'cascade' ? 'auto-update' : ct;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

interface AttributeFieldProps {
  attribute: Attribute;
  value: unknown;
  onChange: (identifier: string, value: unknown) => void;
  onBlur?: (identifier: string) => void;
  error?: string;
  warning?: string;
  disabled?: boolean;
}

function AttributeField({
  attribute,
  value,
  onChange,
  onBlur,
  error,
  warning,
  disabled,
}: AttributeFieldProps) {
  const handleBlur = () => {
    if (onBlur) onBlur(attribute.identifier);
  };
  const label = (
    <Group gap={4}>
      <Text size="sm" fw={500}>
        {attribute.name}
      </Text>
      {attribute.required && (
        <Text size="xs" c="red" component="span">
          *
        </Text>
      )}
    </Group>
  );

  const description = attribute.description || undefined;

  const fieldNode = (() => {
    switch (attribute.type) {
      case 'string':
        return (
          <TextInput
            label={label}
            description={description}
            value={value != null ? String(value) : ''}
            onChange={(e) => onChange(attribute.identifier, e.currentTarget.value)}
            onBlur={handleBlur}
            error={error}
            disabled={disabled}
          />
        );

      case 'one-of':
        return (
          <Select
            label={label}
            description={description}
            data={(attribute.options ?? []).map((o) => ({ value: o, label: o }))}
            value={value != null ? String(value) : null}
            onChange={(val) => onChange(attribute.identifier, val)}
            onBlur={handleBlur}
            error={error}
            disabled={disabled}
            searchable
            clearable
            placeholder="Select..."
          />
        );

      case 'integer':
        return (
          <NumberInput
            label={label}
            description={description}
            value={typeof value === 'number' ? value : ''}
            onChange={(val) =>
              onChange(attribute.identifier, val === '' ? null : val)
            }
            onBlur={handleBlur}
            error={error}
            disabled={disabled}
            allowDecimal={false}
          />
        );

      case 'boolean':
        return (
          <Box onBlur={handleBlur}>
            <Text size="sm" fw={500} mb={4}>
              {attribute.name}
              {attribute.required && (
                <Text size="xs" c="red" component="span">
                  {' '}
                  *
                </Text>
              )}
            </Text>
            {description && (
              <Text size="xs" c="dimmed" mb={4}>
                {description}
              </Text>
            )}
            <Switch
              checked={value === true}
              onChange={(e) =>
                onChange(attribute.identifier, e.currentTarget.checked)
              }
              disabled={disabled}
              label={value === true ? 'Yes' : 'No'}
            />
            {error && (
              <Text size="xs" c="red" mt={2}>
                {error}
              </Text>
            )}
          </Box>
        );

      case 'single-relation':
        return (
          <TextInput
            label={label}
            description={
              description
                ? `${description} (Enter word ID)`
                : 'Enter word ID'
            }
            value={value != null ? String(value) : ''}
            onChange={(e) =>
              onChange(attribute.identifier, e.currentTarget.value || null)
            }
            onBlur={handleBlur}
            error={error}
            disabled={disabled}
            placeholder="Word ID..."
          />
        );

      case 'multiple-relation':
        return (
          <TextInput
            label={label}
            description={
              description
                ? `${description} (Comma-separated word IDs)`
                : 'Comma-separated word IDs'
            }
            value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
            onChange={(e) => {
              const raw = e.currentTarget.value;
              const ids = raw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              onChange(attribute.identifier, ids.length > 0 ? ids : []);
            }}
            onBlur={handleBlur}
            error={error}
            disabled={disabled}
            placeholder="id1, id2, ..."
          />
        );

      default:
        return (
          <TextInput
            label={label}
            value={value != null ? String(value) : ''}
            onChange={(e) => onChange(attribute.identifier, e.currentTarget.value)}
            onBlur={handleBlur}
            error={error}
            disabled={disabled}
          />
        );
    }
  })();

  return (
    <Box>
      {fieldNode}
      {warning && !error && (
        <Alert color="sunset" variant="light" mt={4} p="xs" radius="sm">
          <Text size="xs">{warning}</Text>
        </Alert>
      )}
    </Box>
  );
}

interface DerivativeRowProps {
  derivativeType: DerivativeType;
  derivativeValue: DerivativeValue | undefined;
  projectId: string;
  wordId: string;
  onUpdate: () => void;
}

function DerivativeRow({
  derivativeType,
  derivativeValue,
  projectId,
  wordId,
  onUpdate,
}: DerivativeRowProps) {
  const [editValue, setEditValue] = useState(derivativeValue?.value ?? '');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setEditValue(derivativeValue?.value ?? '');
  }, [derivativeValue?.value]);

  const setValueMutation = useMutation({
    mutationFn: () =>
      setDerivativeValue(projectId, wordId, derivativeType.id, editValue),
    onSuccess: () => {
      notifications.show({
        title: 'Derivative Updated',
        message: `${derivativeType.name} value saved.`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      setIsEditing(false);
      onUpdate();
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update derivative value.',
        color: 'red',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetDerivative(projectId, wordId, derivativeType.id),
    onSuccess: () => {
      notifications.show({
        title: 'Reset',
        message: `${derivativeType.name} reset to auto-generated value.`,
        color: 'blue',
        icon: <IconRefresh size={16} />,
      });
      setIsEditing(false);
      onUpdate();
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to reset derivative value.',
        color: 'red',
      });
    },
  });

  const handleSave = () => {
    setValueMutation.mutate();
  };

  const handleReset = () => {
    modals.openConfirmModal({
      title: 'Reset to Auto',
      centered: true,
      children: (
        <Text size="sm">
          Reset &quot;{derivativeType.name}&quot; to its auto-generated value?
          Your manual edit will be lost.
        </Text>
      ),
      labels: { confirm: 'Reset', cancel: 'Cancel' },
      confirmProps: { color: 'blue' },
      onConfirm: () => resetMutation.mutate(),
    });
  };

  const isUserModified = derivativeValue?.isUserModified ?? false;
  const suggestedValue = derivativeValue?.suggestedValue;

  return (
    <Paper p="sm" withBorder radius="sm">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {derivativeType.name}
            </Text>
            {isUserModified && (
              <Tooltip
                label={suggestedValue ? `Auto: ${suggestedValue}` : 'Manually edited'}
                withArrow
                position="top"
              >
                <Badge
                  size="xs"
                  variant="light"
                  color="sunset"
                  leftSection={<IconAsterisk size={10} />}
                >
                  Modified
                </Badge>
              </Tooltip>
            )}
          </Group>
          <Group gap="xs">
            {isUserModified && (
              <Tooltip label="Reset to auto-generated value">
                <ActionIcon
                  variant="subtle"
                  color="blue"
                  size="sm"
                  onClick={handleReset}
                  loading={resetMutation.isPending}
                >
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>

        {isEditing ? (
          <Group gap="xs" align="flex-end">
            <TextInput
              value={editValue}
              onChange={(e) => setEditValue(e.currentTarget.value)}
              size="sm"
              style={{ flex: 1 }}
              placeholder="Enter derivative value..."
            />
            <Button
              size="xs"
              onClick={handleSave}
              loading={setValueMutation.isPending}
            >
              Save
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                setIsEditing(false);
                setEditValue(derivativeValue?.value ?? '');
              }}
            >
              Cancel
            </Button>
          </Group>
        ) : (
          <Group gap="xs" align="center">
            <Text
              size="sm"
              c={derivativeValue?.value ? undefined : 'dimmed'}
              style={{ cursor: 'pointer', flex: 1 }}
              onClick={() => setIsEditing(true)}
            >
              {derivativeValue?.value || '(empty -- click to edit)'}
            </Text>
          </Group>
        )}

      </Stack>
    </Paper>
  );
}

interface VersionDiffProps {
  leftVersion: WordVersion | null;
  rightVersion: WordVersion | null;
  attributes: Attribute[];
  derivativeTypes: DerivativeType[];
}

type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

interface DiffFieldRow {
  key: string;
  label: string;
  category: 'attribute' | 'derivative';
  before: unknown;
  after: unknown;
  status: DiffStatus;
}

// We intentionally diff only `attributeValues` and `derivatives` from the
// snapshot, so top-level metadata fields like `id`, `projectId`, `createdAt`,
// `updatedAt`, `deletedAt`, `createdBy`, `updatedBy`, and `versionNumber` are
// never shown in the diff.

function isEmptyValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null
  ) {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

// Background tint applied directly to Table.Td so the padding matches the
// field-name column (which has no tint). Keeps all three text columns at the
// same horizontal inset regardless of whether the row is highlighted.
function diffCellBackground(tone: 'before' | 'after' | 'neutral'): string | undefined {
  if (tone === 'before') return 'rgba(229, 103, 103, 0.08)'; // dragon red, subtle
  if (tone === 'after') return 'rgba(151, 212, 125, 0.08)'; // elven green, subtle
  return undefined;
}

function DiffValueContent({ value }: { value: unknown }) {
  if (isEmptyValue(value)) {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        (empty)
      </Text>
    );
  }

  const formatted = formatValue(value);
  const isLong = formatted.length > 40;

  return (
    <Text
      size="sm"
      style={{
        color: '#D3D3D3',
        wordBreak: 'break-word',
        whiteSpace: isLong ? 'pre-wrap' : undefined,
      }}
      lineClamp={isLong ? 4 : undefined}
    >
      {formatted}
    </Text>
  );
}

function StatusBadge({ status }: { status: DiffStatus }) {
  if (status === 'added') {
    return (
      <Badge
        size="xs"
        color="green"
        variant="light"
        leftSection={<IconPlus size={10} />}
      >
        Added
      </Badge>
    );
  }
  if (status === 'removed') {
    return (
      <Badge
        size="xs"
        color="red"
        variant="light"
        leftSection={<IconMinus size={10} />}
      >
        Removed
      </Badge>
    );
  }
  if (status === 'unchanged') {
    return (
      <Badge size="xs" color="gray" variant="light">
        Unchanged
      </Badge>
    );
  }
  return (
    <Badge size="xs" color="blue" variant="light">
      Changed
    </Badge>
  );
}

function VersionDiff({
  leftVersion,
  rightVersion,
  attributes,
  derivativeTypes,
}: VersionDiffProps) {
  // Panel is always rendered even when selection is partial — keeps layout
  // stable as the user toggles selections on/off. Null sides show as empty
  // columns; every field row still renders so the table height is steady.
  let beforeVersion: WordVersion | null = null;
  let afterVersion: WordVersion | null = null;
  if (leftVersion && rightVersion) {
    [beforeVersion, afterVersion] =
      leftVersion.versionNumber <= rightVersion.versionNumber
        ? [leftVersion, rightVersion]
        : [rightVersion, leftVersion];
  } else {
    // With a single version picked, populate the left ("Before") column —
    // feels more natural than anchoring the lone selection on the right.
    beforeVersion = leftVersion ?? rightVersion;
  }

  const beforeSnap = beforeVersion?.snapshot ?? ({} as WordVersion['snapshot']);
  const afterSnap = afterVersion?.snapshot ?? ({} as WordVersion['snapshot']);

  const beforeAttrs = beforeSnap.attributeValues ?? {};
  const afterAttrs = afterSnap.attributeValues ?? {};

  const rows: DiffFieldRow[] = [];

  // Always emit a row per field — unchanged ones are rendered dimmed so the
  // layout stays stable as the selection changes. This replaces the previous
  // "hide unchanged" behaviour which made the panel height jump.

  // Build the key list from the CURRENT attribute schema first (so fields
  // always appear in a predictable order regardless of which versions are
  // compared), then append anything that's in a snapshot but no longer in
  // the schema (renamed/deleted attributes).
  const attrKeys = new Set<string>([
    ...Object.keys(beforeAttrs),
    ...Object.keys(afterAttrs),
  ]);

  const orderedAttrKeys = [
    ...attributes.map((a) => a.identifier),
    ...Array.from(attrKeys).filter(
      (k) => !attributes.some((a) => a.identifier === k),
    ),
  ];

  for (const key of orderedAttrKeys) {
    const beforeVal = beforeAttrs[key];
    const afterVal = afterAttrs[key];

    const attr = attributes.find((a) => a.identifier === key);
    const label = attr?.name ?? key;

    let status: DiffStatus;
    if (valuesEqual(beforeVal, afterVal)) {
      status = 'unchanged';
    } else if (isEmptyValue(beforeVal) && !isEmptyValue(afterVal)) {
      status = 'added';
    } else if (!isEmptyValue(beforeVal) && isEmptyValue(afterVal)) {
      status = 'removed';
    } else {
      status = 'changed';
    }

    rows.push({
      key: `attr:${key}`,
      label,
      category: 'attribute',
      before: beforeVal,
      after: afterVal,
      status,
    });
  }

  const beforeDerivs = beforeSnap.derivatives ?? [];
  const afterDerivs = afterSnap.derivatives ?? [];

  const derivMapBefore = new Map<string, DerivativeValue>();
  for (const d of beforeDerivs) derivMapBefore.set(d.derivativeTypeId, d);
  const derivMapAfter = new Map<string, DerivativeValue>();
  for (const d of afterDerivs) derivMapAfter.set(d.derivativeTypeId, d);

  const derivIds = new Set<string>([
    ...derivMapBefore.keys(),
    ...derivMapAfter.keys(),
  ]);

  const orderedDerivIds = [
    ...derivativeTypes.map((dt) => dt.id),
    ...Array.from(derivIds).filter(
      (id) => !derivativeTypes.some((dt) => dt.id === id),
    ),
  ];

  for (const dtId of orderedDerivIds) {
    const before = derivMapBefore.get(dtId);
    const after = derivMapAfter.get(dtId);

    const beforeVal = before?.value ?? null;
    const afterVal = after?.value ?? null;

    // Skip derivative types that never existed on either snapshot AND aren't
    // in the current derivativeTypes list — nothing meaningful to show.
    if (!before && !after) continue;

    const dtFromTypes = derivativeTypes.find((dt) => dt.id === dtId);
    const dtName =
      dtFromTypes?.name ??
      before?.derivativeTypeName ??
      after?.derivativeTypeName ??
      dtId;

    let status: DiffStatus;
    if (valuesEqual(beforeVal, afterVal)) {
      status = 'unchanged';
    } else if (!before || isEmptyValue(beforeVal)) {
      status = 'added';
    } else if (!after || isEmptyValue(afterVal)) {
      status = 'removed';
    } else {
      status = 'changed';
    }

    rows.push({
      key: `deriv:${dtId}`,
      label: `Derivative: ${dtName}`,
      category: 'derivative',
      before: beforeVal,
      after: afterVal,
      status,
    });
  }

  const changedCount = rows.filter((r) => r.status !== 'unchanged').length;
  const unchangedCount = rows.length - changedCount;

  const beforeLabel = beforeVersion ? `v${beforeVersion.versionNumber}` : '—';
  const afterLabel = afterVersion ? `v${afterVersion.versionNumber}` : '—';

  return (
    <Paper withBorder radius="sm" p="md" style={{ overflow: 'auto' }}>
      <Group justify="space-between" align="center" mb="sm" wrap="nowrap">
        <Group gap="xs" align="center" wrap="nowrap">
          <Text size="sm" fw={600}>
            Comparing
          </Text>
          <Badge variant="light" color="red">
            {beforeLabel}
          </Badge>
          <ThemeIcon variant="transparent" size="sm" color="gray">
            <IconArrowRight size={14} />
          </ThemeIcon>
          <Badge variant="light" color="green">
            {afterLabel}
          </Badge>
        </Group>
        <Badge variant="outline" color={changedCount > 0 ? 'blue' : 'gray'}>
          {changedCount} {changedCount === 1 ? 'change' : 'changes'}
        </Badge>
      </Group>

      <Table striped highlightOnHover withTableBorder={false} verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: '28%' }}>Field</Table.Th>
            <Table.Th style={{ width: '32%' }}>
              Before ({beforeLabel})
            </Table.Th>
            <Table.Th style={{ width: 32 }}></Table.Th>
            <Table.Th style={{ width: '32%' }}>
              After ({afterLabel})
            </Table.Th>
            <Table.Th style={{ width: 90 }}>Status</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => {
            const isUnchanged = row.status === 'unchanged';
            return (
              <Table.Tr
                key={row.key}
                style={isUnchanged ? { opacity: 0.45 } : undefined}
              >
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {row.label}
                  </Text>
                </Table.Td>
                <Table.Td
                  style={{
                    backgroundColor: diffCellBackground(
                      isUnchanged || row.status === 'added' ? 'neutral' : 'before',
                    ),
                  }}
                >
                  <DiffValueContent value={row.before} />
                </Table.Td>
                <Table.Td style={{ textAlign: 'center' }}>
                  <ThemeIcon variant="light" color="gray" size="sm" radius="xl">
                    <IconArrowRight size={12} />
                  </ThemeIcon>
                </Table.Td>
                <Table.Td
                  style={{
                    backgroundColor: diffCellBackground(
                      isUnchanged || row.status === 'removed' ? 'neutral' : 'after',
                    ),
                  }}
                >
                  <DiffValueContent value={row.after} />
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={row.status} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      <Divider my="sm" />
      <Group justify="space-between" align="center">
        <Text size="xs" c="dimmed">
          {unchangedCount} field{unchangedCount === 1 ? '' : 's'} unchanged
        </Text>
        <Text size="xs" c="dimmed">
          Metadata fields (id, timestamps, authors) are not shown.
        </Text>
      </Group>
    </Paper>
  );
}

interface ValidationPanelProps {
  liveValidation: LiveValidationResult | null;
  onNavigateRule: (ruleId: string) => void;
}

function ValidationPanel({
  liveValidation,
  onNavigateRule,
}: ValidationPanelProps) {
  const ruleResults = liveValidation?.ruleResults ?? [];
  const passingCount = ruleResults.filter((r) => r.pass).length;
  const failingCount = ruleResults.filter((r) => !r.pass && r.required).length;
  const warningCount = ruleResults.filter((r) => !r.pass && !r.required).length;

  const header = (
    <Group justify="space-between" align="center" wrap="nowrap">
      <Text size="sm" fw={600} tt="uppercase" c="dimmed">
        Validation
      </Text>
      <Group gap={4} wrap="nowrap">
        <Badge color="green" variant="light" size="xs">
          {passingCount}
        </Badge>
        {failingCount > 0 && (
          <Badge color="red" variant="light" size="xs">
            {failingCount}
          </Badge>
        )}
        {warningCount > 0 && (
          <Badge color="sunset" variant="light" size="xs">
            {warningCount}
          </Badge>
        )}
      </Group>
    </Group>
  );

  if (liveValidation === null || ruleResults.length === 0) {
    return (
      <Stack gap="xs">
        {header}
        <Text size="xs" c="dimmed">
          {liveValidation === null ? 'No validation running' : 'No rules active'}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      {header}
      <Stack gap="xs">
        {ruleResults.map((rule) => {
            const icon = rule.pass ? (
              <IconCircleCheck
                size={18}
                color="var(--mantine-color-green-6)"
              />
            ) : rule.required ? (
              <IconCircleX size={18} color="var(--mantine-color-red-6)" />
            ) : (
              <IconAlertTriangle
                size={18}
                color="var(--mantine-color-sunset-5)"
              />
            );

            return (
              <Paper key={rule.ruleId} p={6} withBorder radius={0}>
                <Group
                  justify="space-between"
                  align="center"
                  wrap="nowrap"
                  gap={6}
                >
                  <Group
                    align="center"
                    gap={6}
                    wrap="nowrap"
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    {icon}
                    <Text
                      size="sm"
                      fw={500}
                      truncate
                      style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                      onClick={() => onNavigateRule(rule.ruleId)}
                    >
                      {rule.ruleName}
                    </Text>
                  </Group>
                  <Badge
                    size="xs"
                    variant="light"
                    color={rule.required ? 'red' : 'gray'}
                  >
                    {rule.required ? 'required' : 'optional'}
                  </Badge>
                </Group>
                {!rule.pass && rule.message && (
                  <Text size="xs" c="dimmed" mt={2} ml={22}>
                    {rule.message}
                  </Text>
                )}
              </Paper>
            );
          })}
      </Stack>
    </Stack>
  );
}

export default function WordEditorPage() {
  const { projectId, wordId } = useParams<{
    projectId: string;
    wordId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isNew = !wordId || wordId === 'new';

  const [attributeValues, setAttributeValues] = useState<
    Record<string, unknown>
  >({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fieldWarnings, setFieldWarnings] = useState<Record<string, string>>(
    {},
  );
  const [formDirty, setFormDirty] = useState(false);
  const [formInitialised, setFormInitialised] = useState(false);
  // Suppress per-field error/warning rendering on initial mount. Only show an
  // attribute's error/warning once the user has interacted with that field
  // (blur) or attempted to submit the form.
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>(
    {},
  );

  const [liveValidation, setLiveValidation] =
    useState<LiveValidationResult | null>(null);
  const liveValidationRequestIdRef = useRef<number>(0);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [diffLeftId, setDiffLeftId] = useState<string | null>(null);
  const [diffRightId, setDiffRightId] = useState<string | null>(null);
  const [derivativesExpanded, setDerivativesExpanded] = useState(true);

  const { data: attributesData, isLoading: attributesLoading } = useQuery({
    queryKey: ['attributes', projectId],
    queryFn: () => getAttributes(projectId!),
    enabled: !!projectId,
  });

  const { data: derivativeTypesData } = useQuery({
    queryKey: ['derivative-types', projectId],
    queryFn: () => getDerivativeTypes(projectId!),
    enabled: !!projectId,
  });

  const {
    data: wordData,
    isLoading: wordLoading,
    error: wordError,
    refetch: refetchWord,
  } = useQuery({
    queryKey: ['word', projectId, wordId],
    queryFn: () => getWord(projectId!, wordId!),
    enabled: !!projectId && !!wordId && !isNew,
  });

  const { data: versionsData, refetch: refetchVersions } = useQuery({
    queryKey: ['word-versions', projectId, wordId],
    queryFn: () => getWordVersions(projectId!, wordId!),
    enabled: !!projectId && !!wordId && !isNew,
  });

  const { data: viewedVersion } = useQuery({
    queryKey: ['word-version', projectId, wordId, selectedVersionId],
    queryFn: () => getWordVersion(projectId!, wordId!, selectedVersionId!),
    enabled: !!projectId && !!wordId && !!selectedVersionId && !isNew,
  });

  const { data: diffLeft } = useQuery({
    queryKey: ['word-version', projectId, wordId, diffLeftId],
    queryFn: () => getWordVersion(projectId!, wordId!, diffLeftId!),
    enabled: !!diffLeftId && !!projectId && !!wordId,
  });

  const { data: diffRight } = useQuery({
    queryKey: ['word-version', projectId, wordId, diffRightId],
    queryFn: () => getWordVersion(projectId!, wordId!, diffRightId!),
    enabled: !!diffRightId && !!projectId && !!wordId,
  });

  const attributes = attributesData?.items ?? [];
  const derivativeTypes = derivativeTypesData?.items ?? [];
  const versions = versionsData?.items ?? [];

  useEffect(() => {
    if (wordData && !formDirty) {
      setAttributeValues(wordData.attributeValues ?? {});
      setFormInitialised(true);
    }
  }, [wordData, formDirty]);

  // For new words, mark the form as initialised immediately so that live
  // validation can start running against the empty attribute set.
  useEffect(() => {
    if (isNew) {
      setFormInitialised(true);
    }
  }, [isNew]);


  // Live validation: debounce 300ms, cancel previous request via AbortController,
  // and discard stale responses via a monotonic request counter.
  useEffect(() => {
    if (!projectId || !formInitialised) {
      return;
    }

    const controller = new AbortController();
    liveValidationRequestIdRef.current += 1;
    const requestId = liveValidationRequestIdRef.current;

    const timer = window.setTimeout(() => {
      validateWordLive(
        projectId,
        {
          attributeValues,
          ...(isNew ? {} : { excludeWordId: wordId }),
        },
        controller.signal,
      )
        .then((result) => {
          if (requestId === liveValidationRequestIdRef.current) {
            setLiveValidation(result);
          }
        })
        .catch(() => {
          // Aborted or failed — ignore silently.
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, wordId, isNew, attributeValues, formInitialised]);

  // Build a lookup from attribute id → identifier so we can map server
  // attribute-level errors back to our form's identifier-keyed field state.
  const attributeIdToIdentifier = useMemo(() => {
    const map = new Map<string, string>();
    for (const attr of attributes) {
      map.set(attr.id, attr.identifier);
    }
    return map;
  }, [attributes]);

  // Derived displayed errors/warnings per attribute identifier. Live
  // validation is the primary source while editing; post-save field state
  // supplements it on failure.
  const displayedErrors = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (liveValidation) {
      for (const err of liveValidation.errors) {
        const msg = err.message || `${err.ruleName}: Validation failed`;
        const label = err.message ? `${err.ruleName}: ${err.message}` : msg;
        if (err.attributeId) {
          const identifier =
            attributeIdToIdentifier.get(err.attributeId) ?? err.attributeId;
          if (!out[identifier]) out[identifier] = label;
        }
        for (const touched of err.touchedAttributes) {
          if (!out[touched]) out[touched] = label;
        }
      }
    }
    for (const [key, value] of Object.entries(fieldErrors)) {
      if (!out[key]) out[key] = value;
    }
    return out;
  }, [liveValidation, fieldErrors, attributeIdToIdentifier]);

  const displayedWarnings = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (liveValidation) {
      for (const warn of liveValidation.warnings) {
        const label = warn.message
          ? `${warn.ruleName}: ${warn.message}`
          : `${warn.ruleName}: Warning`;
        for (const touched of warn.touchedAttributes) {
          if (!out[touched]) out[touched] = label;
        }
      }
    }
    for (const [key, value] of Object.entries(fieldWarnings)) {
      if (!out[key]) out[key] = value;
    }
    return out;
  }, [liveValidation, fieldWarnings]);

  const primaryAttribute = attributes.length > 0 ? attributes[0] : null;
  const titleValue = primaryAttribute
    ? attributeValues[primaryAttribute.identifier]
    : null;
  const pageTitle = isNew
    ? 'New Word'
    : titleValue
      ? String(titleValue)
      : 'Edit Word';

  const handleFieldChange = useCallback(
    (identifier: string, value: unknown) => {
      setAttributeValues((prev) => ({ ...prev, [identifier]: value }));
      setFormDirty(true);
      setFieldErrors((prev) => {
        if (prev[identifier]) {
          const next = { ...prev };
          delete next[identifier];
          return next;
        }
        return prev;
      });
    },
    [],
  );

  // Field blur handler: marks a field as touched so its errors/warnings
  // begin to display in the UI.
  const handleFieldBlur = useCallback((identifier: string) => {
    setTouchedFields((prev) => {
      if (prev[identifier]) return prev;
      return { ...prev, [identifier]: true };
    });
  }, []);

  // Only show per-field errors/warnings for fields the user has interacted
  // with, or after an attempted submit. Live validation still runs in the
  // background and populates the validation panel unconditionally.
  const visibleFieldErrors = useMemo<Record<string, string>>(() => {
    if (hasAttemptedSubmit) return displayedErrors;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(displayedErrors)) {
      if (touchedFields[key]) out[key] = value;
    }
    return out;
  }, [displayedErrors, touchedFields, hasAttemptedSubmit]);

  const visibleFieldWarnings = useMemo<Record<string, string>>(() => {
    if (hasAttemptedSubmit) return displayedWarnings;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(displayedWarnings)) {
      if (touchedFields[key]) out[key] = value;
    }
    return out;
  }, [displayedWarnings, touchedFields, hasAttemptedSubmit]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isNew) {
        return createWord(projectId!, { attributeValues });
      }
      return updateWord(projectId!, wordId!, { attributeValues });
    },
    onSuccess: (data) => {
      setFormDirty(false);
      setFieldErrors({});
      setFieldWarnings({});

      const responseData = data as Word & {
        validation?: {
          warnings?: Array<{
            attributeId: string;
            ruleName: string;
            message?: string;
          }>;
        };
      };
      if (responseData.validation?.warnings) {
        const warns: Record<string, string> = {};
        for (const w of responseData.validation.warnings) {
          const attr = attributes.find((a) => a.id === w.attributeId);
          const key = attr?.identifier ?? w.attributeId;
          warns[key] = `${w.ruleName}: ${w.message || 'Warning'}`;
        }
        setFieldWarnings(warns);
      }

      notifications.show({
        title: isNew ? 'Word Created' : 'Word Saved',
        message: isNew
          ? 'Word created successfully.'
          : 'Changes saved successfully.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      queryClient.invalidateQueries({
        queryKey: ['words-search', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['words-list', projectId],
      });
      if (isNew) {
        navigate(`/projects/${projectId}/words/${data.id}`, { replace: true });
      } else {
        refetchWord();
        refetchVersions();
      }
    },
    onError: (err: unknown) => {
      const axiosErr = err as {
        response?: {
          data?: {
            errors?:
              | Record<string, string>
              | Array<{
                  attributeId: string;
                  ruleName: string;
                  message?: string;
                }>;
            warnings?: Array<{
              attributeId: string;
              ruleName: string;
              message?: string;
            }>;
            message?: string;
          };
        };
      };

      const serverErrors = axiosErr.response?.data?.errors;
      const serverWarnings = axiosErr.response?.data?.warnings;

      if (serverErrors) {
        if (Array.isArray(serverErrors)) {
          const errs: Record<string, string> = {};
          for (const e of serverErrors) {
            const attr = attributes.find((a) => a.id === e.attributeId);
            const key = attr?.identifier ?? e.attributeId;
            errs[key] = `${e.ruleName}: ${e.message || 'Validation failed'}`;
          }
          setFieldErrors(errs);
        } else {
          setFieldErrors(serverErrors);
        }

        if (serverWarnings) {
          const warns: Record<string, string> = {};
          for (const w of serverWarnings) {
            const attr = attributes.find((a) => a.id === w.attributeId);
            const key = attr?.identifier ?? w.attributeId;
            warns[key] = `${w.ruleName}: ${w.message || 'Warning'}`;
          }
          setFieldWarnings(warns);
        }

        notifications.show({
          title: 'Validation Error',
          message: 'Please fix the highlighted fields.',
          color: 'yellow',
          icon: <IconAlertCircle size={16} />,
        });
      } else {
        notifications.show({
          title: 'Error',
          message:
            axiosErr.response?.data?.message ??
            'Failed to save word. Please try again.',
          color: 'red',
        });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWord(projectId!, wordId!),
    onSuccess: () => {
      notifications.show({
        title: 'Deleted',
        message: 'Word deleted successfully.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      queryClient.invalidateQueries({
        queryKey: ['words-search', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['words-list', projectId],
      });
      navigate(`/projects/${projectId}/words`, { replace: true });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete word.',
        color: 'red',
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      restoreWordVersion(projectId!, wordId!, versionId),
    onSuccess: () => {
      notifications.show({
        title: 'Restored',
        message: 'Word restored to selected version.',
        color: 'green',
        icon: <IconRestore size={16} />,
      });
      setSelectedVersionId(null);
      setFormDirty(false);
      refetchWord();
      refetchVersions();
      queryClient.invalidateQueries({
        queryKey: ['words-search', projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['words-list', projectId],
      });
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to restore version.',
        color: 'red',
      });
    },
  });

  // Central save handler that also flags the "attempted submit" state so
  // per-field errors begin to render on failure.
  const handleSave = useCallback(() => {
    setHasAttemptedSubmit(true);
    if (!saveMutation.isPending) {
      saveMutation.mutate();
    }
  }, [saveMutation]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [handleSave]);

  const handleDelete = () => {
    modals.openConfirmModal({
      title: 'Delete Word',
      centered: true,
      children: (
        <Text size="sm">
          Are you sure you want to delete this word? It will be soft-deleted and
          can be found in the version history.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteMutation.mutate(),
    });
  };

  const handleRestore = (versionId: string) => {
    modals.openConfirmModal({
      title: 'Restore Version',
      centered: true,
      children: (
        <Text size="sm">
          Restore the word to this version? A new version will be created with
          the restored state.
        </Text>
      ),
      labels: { confirm: 'Restore', cancel: 'Cancel' },
      confirmProps: { color: 'blue' },
      onConfirm: () => restoreMutation.mutate(versionId),
    });
  };

  // Right-click toggle for version comparison. First right-click marks "A",
  // second marks "B" and the diff appears. Right-clicking a selected card
  // clears that slot (promoting B → A if A is cleared). Right-clicking a
  // fresh card while both slots are filled restarts with the new card as A.
  const handleDiffToggle = (versionId: string) => {
    if (diffLeftId === versionId) {
      setDiffLeftId(diffRightId);
      setDiffRightId(null);
    } else if (diffRightId === versionId) {
      setDiffRightId(null);
    } else if (!diffLeftId) {
      setDiffLeftId(versionId);
    } else if (!diffRightId) {
      setDiffRightId(versionId);
    } else {
      setDiffLeftId(versionId);
      setDiffRightId(null);
    }
  };

  const handleDerivativeUpdate = useCallback(() => {
    refetchWord();
  }, [refetchWord]);

  const isLoadingPage = attributesLoading || (!isNew && wordLoading);

  if (isLoadingPage) {
    return (
      <Center py="xl">
        <Loader size="lg" color="atlantis" />
      </Center>
    );
  }

  if (!isNew && wordError) {
    return (
      <Stack gap="sm">
        <LoadErrorAlert
          title="Error loading word"
          error={wordError}
          fallback="Failed to load the word. It may have been deleted."
        />
        <Button
          variant="light"
          size="xs"
          onClick={() => navigate(`/projects/${projectId}/words`)}
          style={{ alignSelf: 'flex-start' }}
        >
          Back to Words
        </Button>
      </Stack>
    );
  }

  const viewingVersion = !!selectedVersionId && viewedVersion;
  const displayValues = viewingVersion
    ? viewedVersion.snapshot.attributeValues
    : attributeValues;

  const currentDerivatives: DerivativeValue[] = wordData?.derivatives ?? [];

  // When viewing a historic version, show the derivatives from that
  // snapshot (they may include types that are no longer applicable to
  // the current word). Otherwise show only currently applicable types.
  const displayDerivatives: DerivativeValue[] = viewingVersion
    ? (viewedVersion.snapshot.derivatives ?? []).map((d: any) => {
        const dtInfo = derivativeTypes.find((dt) => dt.id === d.derivativeTypeId);
        return {
          derivativeTypeId: d.derivativeTypeId,
          derivativeTypeName: dtInfo?.name ?? d.name ?? d.derivativeTypeId,
          value: d.value,
          isUserModified: d.userModified ?? d.isUserModified ?? false,
          suggestedValue: null,
        };
      })
    : currentDerivatives;

  const applicableDerivativeIds = new Set(
    displayDerivatives.map((d) => d.derivativeTypeId),
  );
  const applicableDerivativeTypes = viewingVersion
    ? // When viewing history, show all types that had a derivative in that snapshot
      derivativeTypes.filter((dt) => applicableDerivativeIds.has(dt.id))
    : // When live, show only currently applicable types
      derivativeTypes.filter((dt) => applicableDerivativeIds.has(dt.id));

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => navigate(`/projects/${projectId}/words`)}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Title order={2}>{pageTitle}</Title>
            {viewingVersion && (
              <Badge color="orange" variant="light" size="lg">
                Viewing v{viewedVersion.versionNumber}
              </Badge>
            )}
          </Group>
        </Group>

        {viewingVersion && (
          <Alert
            color="orange"
            icon={<IconClock size={16} />}
            title={`Viewing version ${viewedVersion.versionNumber}`}
            withCloseButton
            onClose={() => setSelectedVersionId(null)}
          >
            <Text size="sm">
              {changeTypeLabel(viewedVersion.changeType)} by {viewedVersion.userName} on{' '}
              {formatTimestamp(viewedVersion.createdAt)}
            </Text>
            <Group mt="xs" gap="xs">
              <Button
                size="xs"
                color="blue"
                leftSection={<IconRestore size={14} />}
                onClick={() => handleRestore(viewedVersion.id)}
                loading={restoreMutation.isPending}
              >
                Restore This Version
              </Button>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setSelectedVersionId(null)}
              >
                Back to Current
              </Button>
            </Group>
          </Alert>
        )}

        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="md">
              <Paper p="lg" withBorder radius="sm">
                <Stack gap="md">
                  <Text size="lg" fw={600}>
                    Attributes
                  </Text>
                  {attributes.length === 0 ? (
                    <Text size="sm" c="dimmed">
                      No attributes configured for this project. Add attributes
                      in project settings.
                    </Text>
                  ) : (
                    attributes.map((attr) => (
                      <AttributeField
                        key={attr.id}
                        attribute={attr}
                        value={displayValues[attr.identifier]}
                        onChange={handleFieldChange}
                        onBlur={handleFieldBlur}
                        error={visibleFieldErrors[attr.identifier]}
                        warning={visibleFieldWarnings[attr.identifier]}
                        disabled={!!viewingVersion}
                      />
                    ))
                  )}
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 4 }}>
            <Box style={{ position: 'sticky', top: 16 }}>
              <Stack gap="md">
                <Paper p="md" withBorder radius="sm">
                  <ValidationPanel
                    liveValidation={liveValidation}
                    onNavigateRule={(ruleId) =>
                      navigate(`/projects/${projectId}/rules/${ruleId}/editor`)
                    }
                  />
                </Paper>

                {!isNew && (
                  <Paper p="md" withBorder radius="sm">
                    {applicableDerivativeTypes.length === 0 ? (
                      <Stack gap="xs">
                        <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                          Derivatives
                        </Text>
                        <Text size="xs" c="dimmed">
                          No derivatives for this word
                        </Text>
                      </Stack>
                    ) : (
                      <Stack gap="sm">
                        <Group
                          justify="space-between"
                          align="center"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setDerivativesExpanded((v) => !v)}
                          wrap="nowrap"
                        >
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" fw={600} tt="uppercase" c="dimmed">
                              Derivatives
                            </Text>
                            <Badge size="xs" variant="light" color="gray">
                              {applicableDerivativeTypes.length}
                            </Badge>
                          </Group>
                          <ActionIcon variant="subtle" size="sm">
                            {derivativesExpanded ? (
                              <IconChevronDown size={16} />
                            ) : (
                              <IconChevronRight size={16} />
                            )}
                          </ActionIcon>
                        </Group>
                        <Collapse in={derivativesExpanded}>
                          <Stack gap="sm">
                            {applicableDerivativeTypes.map((dt) => {
                              const dv = displayDerivatives.find(
                                (d) => d.derivativeTypeId === dt.id,
                              );
                              return (
                                <DerivativeRow
                                  key={dt.id}
                                  derivativeType={dt}
                                  derivativeValue={dv}
                                  projectId={projectId!}
                                  wordId={wordId!}
                                  onUpdate={handleDerivativeUpdate}
                                />
                              );
                            })}
                          </Stack>
                        </Collapse>
                      </Stack>
                    )}
                  </Paper>
                )}
              </Stack>
            </Box>
          </Grid.Col>
        </Grid>

        {!isNew && (
          <Box>
            {/* Toggle bar — always visible. Padding matches the sticky save
             * bar below so the two rows read as a consistent footer pair. */}
            <Group
              justify="space-between"
              px="md"
              py="sm"
              style={{ cursor: 'pointer' }}
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <Group gap="xs">
                <IconHistory size={16} color="var(--mantine-color-dimmed)" />
                <Text size="sm" fw={600} c="dimmed">
                  Version History{versions.length > 0 ? ` (${versions.length})` : ''}
                </Text>
                {historyOpen ? (
                  <IconChevronDown size={14} color="var(--mantine-color-dimmed)" />
                ) : (
                  <IconChevronRight size={14} color="var(--mantine-color-dimmed)" />
                )}
              </Group>
            </Group>

            <Collapse in={historyOpen}>
              <Box px="md" pb="md">
                <VersionHistoryPanel
                  versions={versions}
                  selectedVersionId={selectedVersionId}
                  onSelectVersion={setSelectedVersionId}
                  onRestore={handleRestore}
                  restoring={restoreMutation.isPending}
                  diffLeftId={diffLeftId}
                  diffRightId={diffRightId}
                  onDiffToggle={handleDiffToggle}
                  diffLeft={diffLeft ?? null}
                  diffRight={diffRight ?? null}
                  attributes={attributes}
                  derivativeTypes={derivativeTypes}
                />
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Sticky save bar — horizontal bounds match the content above so
         * the top border aligns with the rest of the page. Vertical negative
         * margin keeps the bar flush with the AppShell.Main bottom padding. */}
        <Box
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 10,
            backgroundColor: 'var(--mantine-color-body)',
            borderTop: '1px solid var(--mantine-color-default-border)',
            marginBottom: 'calc(var(--mantine-spacing-md) * -1)',
            padding: 'var(--mantine-spacing-sm) 0',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Group justify="flex-end" gap="xs">
            {!isNew && (
              <Button
                variant="light"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleDelete}
                loading={deleteMutation.isPending}
              >
                Delete
              </Button>
            )}
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={!!viewingVersion}
            >
              {isNew ? 'Create' : 'Save'}
            </Button>
          </Group>
        </Box>
      </Stack>
    </>
  );
}

interface VersionHistoryPanelProps {
  versions: WordVersion[];
  selectedVersionId: string | null;
  onSelectVersion: (id: string | null) => void;
  onRestore: (id: string) => void;
  restoring: boolean;
  diffLeftId: string | null;
  diffRightId: string | null;
  onDiffToggle: (id: string) => void;
  diffLeft: WordVersion | null;
  diffRight: WordVersion | null;
  attributes: Attribute[];
  derivativeTypes: DerivativeType[];
}

function VersionHistoryPanel({
  versions,
  selectedVersionId,
  onSelectVersion,
  onRestore,
  restoring,
  diffLeftId,
  diffRightId,
  onDiffToggle,
  diffLeft,
  diffRight,
  attributes,
  derivativeTypes,
}: VersionHistoryPanelProps) {
  if (versions.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="sm">
        No version history available yet.
      </Text>
    );
  }

  const diffActive = !!diffLeftId || !!diffRightId;
  const diffComplete = !!diffLeftId && !!diffRightId;

  const hintText = diffComplete
    ? 'Comparison shown below. Right-click a version to change the selection.'
    : diffActive
      ? 'Right-click another version to complete the comparison.'
      : 'Right-click any two versions to compare them below.';

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        {hintText}
      </Text>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 8,
        }}
      >
        {versions.map((version) => {
          const isSelected = selectedVersionId === version.id;
          const isDiffSelected =
            diffLeftId === version.id || diffRightId === version.id;

          return (
            <Paper
              key={version.id}
              p="xs"
              withBorder
              onContextMenu={(e) => {
                e.preventDefault();
                onDiffToggle(version.id);
              }}
              style={{
                borderColor: isDiffSelected
                  ? '#E89768'
                  : isSelected
                    ? '#8880F0'
                    : undefined,
              }}
            >
              <Group justify="space-between" mb={4}>
                <Group gap={6}>
                  <Text size="xs" fw={700} c="white">
                    v{version.versionNumber}
                  </Text>
                  <Badge
                    size="xs"
                    color={changeTypeBadgeColor(version.changeType)}
                    variant="filled"
                  >
                    {changeTypeLabel(version.changeType)}
                  </Badge>
                  {isDiffSelected && (
                    <Badge size="xs" color="sunset" variant="light">
                      {diffLeftId === version.id ? 'A' : 'B'}
                    </Badge>
                  )}
                </Group>
              </Group>
              <Text size="xs" c="dimmed">
                {version.userName} · {formatTimestamp(version.createdAt)}
              </Text>
              <Group gap={6} mt={6}>
                <Button
                  variant={isSelected ? 'filled' : 'default'}
                  size="compact-xs"
                  onClick={() =>
                    onSelectVersion(isSelected ? null : version.id)
                  }
                >
                  {isSelected ? 'Viewing' : 'View'}
                </Button>
                <Button
                  variant="default"
                  size="compact-xs"
                  leftSection={<IconRestore size={10} />}
                  onClick={() => onRestore(version.id)}
                  loading={restoring}
                >
                  Restore
                </Button>
              </Group>
            </Paper>
          );
        })}
      </div>

      <VersionDiff
        leftVersion={diffLeft ?? null}
        rightVersion={diffRight ?? null}
        attributes={attributes}
        derivativeTypes={derivativeTypes}
      />
    </Stack>
  );
}
