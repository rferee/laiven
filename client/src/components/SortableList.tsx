import { type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { DraggableAttributes } from '@dnd-kit/core';

/**
 * Props to spread onto an explicit drag handle element (e.g. a small grab icon)
 * so that dragging only starts when the user grabs that handle rather than the
 * whole row.
 */
export interface DragHandleProps {
  ref: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  style: CSSProperties;
}

export interface SortableListProps<T extends { id: string }> {
  items: T[];
  onReorder: (newIds: string[]) => void;
  renderItem: (
    item: T,
    isDragging: boolean,
    dragHandleProps: DragHandleProps,
  ) => ReactNode;
}

interface SortableRowProps<T extends { id: string }> {
  item: T;
  renderItem: SortableListProps<T>['renderItem'];
}

function SortableRow<T extends { id: string }>({ item, renderItem }: SortableRowProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    boxShadow: isDragging
      ? '0 10px 24px rgba(0, 0, 0, 0.18)'
      : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };

  const dragHandleProps: DragHandleProps = {
    ref: setActivatorNodeRef,
    attributes,
    listeners,
    style: {
      cursor: isDragging ? 'grabbing' : 'grab',
      touchAction: 'none',
    },
  };

  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(item, isDragging, dragHandleProps)}
    </div>
  );
}

export default function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = [...items];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    onReorder(next.map((i) => i.id));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        {items.map((item) => (
          <SortableRow key={item.id} item={item} renderItem={renderItem} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
