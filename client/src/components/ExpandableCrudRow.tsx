import {
  Card,
  Group,
  Text,
  Badge,
  ActionIcon,
  Collapse,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconTrash,
  IconGripVertical,
} from '@tabler/icons-react';
import type { ReactNode, CSSProperties } from 'react';
import type { DragHandleProps } from './SortableList';

export interface BadgeSpec {
  label: string;
  color?: string;
}

/**
 * Drag-handle bundle produced by `SortableList`'s renderItem prop.
 *
 * Kept as a structural alias of `DragHandleProps` so callers can pass the
 * render-prop value through unchanged, while letting `ExpandableCrudRow` stay
 * decoupled from the `@dnd-kit` types at its own surface.
 */
export interface DragHandleBundle {
  ref: (node: HTMLElement | null) => void;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  style?: CSSProperties;
}

interface ExpandableCrudRowProps {
  /** Primary label; usually the entity's name. */
  title: ReactNode;
  /** Typed badges shown inline after the title. */
  badges?: BadgeSpec[];
  /** Extra dimmed text or widget shown after badges in the row header. */
  meta?: ReactNode;
  /** Extra content shown on the right side, immediately before the trash icon. */
  rightSlot?: ReactNode;
  /** Whether the expanded area is currently open. */
  expanded: boolean;
  /** Called when the user clicks the row to toggle expansion. */
  onToggle: () => void;
  /** Called when the trash ActionIcon is clicked. */
  onDelete: () => void;
  /** Pass when the row is rendered inside a `SortableList`. Omit otherwise. */
  dragHandle?: DragHandleProps | DragHandleBundle;
  /** The form or details rendered in the expanded area. */
  expandedContent: ReactNode;
  /** aria-label for the trash icon. Also used as the tooltip label. */
  deleteAriaLabel?: string;
}

/**
 * Expandable card row with an optional drag handle, a title / badge cluster,
 * a trash affordance and a collapsible body.
 *
 * Click handling:
 * - Outer Card toggles expansion when clicked anywhere except the explicit
 *   stopPropagation zones.
 * - The drag handle, the trailing action group and the expanded body each stop
 *   propagation so their own controls don't accidentally collapse the row.
 * - The expanded body stops both `click` and `mousedown` — this matches the
 *   fix for the AttributesPage `uniqueMode` bug where SegmentedControl's
 *   internal mousedown-before-click sequence was bubbling through.
 *
 * Leading affordance:
 * - When `dragHandle` is present the grip icon serves as the left affordance
 *   and no chevron is rendered (matches the existing AttributesPage layout).
 * - Otherwise a chevron indicates the current expanded state (matches the
 *   existing VariablesPage layout).
 */
export default function ExpandableCrudRow({
  title,
  badges,
  meta,
  rightSlot,
  expanded,
  onToggle,
  onDelete,
  dragHandle,
  expandedContent,
  deleteAriaLabel = 'Delete',
}: ExpandableCrudRowProps) {
  return (
    <Card
      withBorder
      radius="md"
      padding="sm"
      onClick={onToggle}
      style={{ cursor: 'pointer' }}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          {dragHandle ? (
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              ref={dragHandle.ref}
              {...dragHandle.attributes}
              {...dragHandle.listeners}
              style={dragHandle.style}
              onClick={(e) => e.stopPropagation()}
              aria-label="Drag handle"
            >
              <IconGripVertical size={18} />
            </ActionIcon>
          ) : expanded ? (
            <IconChevronDown size={16} color="var(--mantine-color-dimmed)" />
          ) : (
            <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />
          )}
          <Text fw={500} truncate style={{ minWidth: 0 }}>
            {title}
          </Text>
          {badges?.map((b, i) => (
            <Badge key={i} size="sm" variant="light" color={b.color}>
              {b.label}
            </Badge>
          ))}
          {meta}
        </Group>
        <Group
          gap={4}
          wrap="nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          {rightSlot}
          <Tooltip label={deleteAriaLabel}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="red"
              aria-label={deleteAriaLabel}
              onClick={(e) => {
                e.currentTarget.blur();
                onDelete();
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Collapse in={expanded}>
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ marginTop: 12 }}
        >
          {expandedContent}
        </div>
      </Collapse>
    </Card>
  );
}
