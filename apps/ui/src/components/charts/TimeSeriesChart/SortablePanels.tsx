import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import type { PanelEntry } from "./types";

/** What a panel is called when its handle is named: its series, or the one
 *  series it draws. */
export function panelLabel(panel: PanelEntry): string {
  return panel.type === "float" || panel.type === "bar"
    ? panel.series.map((s) => s.label).join(", ")
    : panel.series.label;
}

/**
 * Lets the viewer reorder the chart's panels by their handles, pointer or
 * keyboard. The panels stay in document flow — the shared cursor reads them
 * by their stacked heights — so only the dragged one moves, by transform,
 * until it is dropped and the caller renders the new order.
 */
export function SortablePanels({
  panels,
  onReorder,
  onDraggingChange,
  handleLabel,
  children,
}: {
  panels: PanelEntry[];
  onReorder: (keys: string[]) => void;
  onDraggingChange: (dragging: boolean) => void;
  handleLabel: (panelLabel: string) => string;
  children: (panel: PanelEntry, index: number) => ReactNode;
}) {
  const keys = panels.map((p) => p.key);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    onDraggingChange(false);
    if (!over || active.id === over.id) return;
    const from = keys.indexOf(String(active.id));
    const to = keys.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(arrayMove(keys, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => onDraggingChange(true)}
      onDragCancel={() => onDraggingChange(false)}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        {panels.map((panel, index) => (
          <SortablePanel
            key={panel.key}
            id={panel.key}
            label={handleLabel(panelLabel(panel))}
            sortable={panels.length > 1}
          >
            {children(panel, index)}
          </SortablePanel>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function SortablePanel({
  id,
  label,
  sortable,
  children,
}: {
  id: string;
  label: string;
  sortable: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !sortable });
  return (
    <div
      ref={setNodeRef}
      style={{
        position: "relative",
        // Translate only: panels differ in height, and a full transform
        // would scale a panel to the slot it lands in as it settles.
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {sortable && (
        // At the right end of the legend band, clear of the legend itself,
        // which starts at the left.
        <button
          type="button"
          aria-label={label}
          className="absolute right-2 top-1.5 z-10 flex size-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      )}
      {children}
    </div>
  );
}
