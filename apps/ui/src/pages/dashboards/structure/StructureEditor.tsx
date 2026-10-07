import { useMemo, useState } from "react";
import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Ellipsis, GripVertical, PencilLine, Trash2 } from "lucide-react";
import type { DashboardStructure } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardIconGlyph } from "@/lib/dashboardIcons";
import { cn } from "@/lib/utils";
import {
  build,
  descendants,
  flatten,
  move,
  project,
  type Projection,
  type Row,
} from "./structureTree";

/** Horizontal drag distance that reads as one level of nesting. */
const INDENT = 28;

interface StructureEditorProps {
  structure: DashboardStructure;
  onChange: (next: DashboardStructure) => void;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
}

/** The structure as an outline: one sortable list where a row's indent is
 *  its depth. Dragging up or down reorders; dragging sideways nests or
 *  un-nests, within what the neighbours and the row's kind allow. A
 *  container travels with its contents. */
export const StructureEditor: FC<StructureEditorProps> = ({
  structure,
  onChange,
  onEdit,
  onDelete,
}) => {
  const { t } = useTranslation("dashboards");
  const rows = useMemo(() => flatten(structure), [structure]);
  const [drag, setDrag] = useState<{
    activeId: string;
    overId: string;
    offsetX: number;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const active = drag ? rows.find((r) => r.id === drag.activeId) : undefined;
  const projection: Projection | null =
    drag && active
      ? project(
          rows,
          drag.activeId,
          drag.overId,
          active.depth + Math.round(drag.offsetX / INDENT),
        )
      : null;
  // The dragged container's contents follow it, so they are not drawn
  // while it moves.
  const hidden = useMemo(
    () =>
      new Set(drag ? descendants(rows, drag.activeId).map((r) => r.id) : []),
    [rows, drag],
  );
  const visible = rows.filter((r) => !hidden.has(r.id));

  const onDragStart = ({ active }: DragStartEvent) =>
    setDrag({
      activeId: String(active.id),
      overId: String(active.id),
      offsetX: 0,
    });
  const onDragMove = ({ delta }: DragMoveEvent) =>
    setDrag((d) => (d ? { ...d, offsetX: delta.x } : d));
  const onDragOver = ({ over }: DragOverEvent) =>
    setDrag((d) => (d && over ? { ...d, overId: String(over.id) } : d));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const target = project(
      rows,
      String(active.id),
      String(over?.id ?? active.id),
      (rows.find((r) => r.id === active.id)?.depth ?? 0) +
        Math.round((drag?.offsetX ?? 0) / INDENT),
    );
    setDrag(null);
    if (!over || !target) return;
    const next = move(rows, String(active.id), String(over.id), target);
    if (next.some((r, i) => r !== rows[i])) onChange(build(next));
  };

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDrag(null)}
      >
        <SortableContext
          items={visible.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          <ol className="m-0 list-none space-y-1.5 p-0">
            {visible.map((row) => (
              <StructureRow
                key={row.id}
                row={row}
                depth={
                  drag?.activeId === row.id && projection
                    ? projection.depth
                    : row.depth
                }
                sortable={rows.length > 1}
                onEdit={() => onEdit(row)}
                onDelete={() => onDelete(row)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {rows.length > 1 && (
        <p className="text-xs leading-5 text-muted-foreground">
          {t("manage.orderHelp")}
        </p>
      )}
    </div>
  );
};

const StructureRow: FC<{
  row: Row;
  depth: number;
  sortable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ row, depth, sortable, onEdit, onDelete }) => {
  const { t } = useTranslation("dashboards");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: !sortable });
  const name = row.label || row.id;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        marginLeft: depth * INDENT,
      }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card py-1.5 pl-1 pr-2",
        row.kind === "section" && "border-dashed bg-muted/40",
        isDragging && "relative z-10 shadow-lg ring-1 ring-border",
      )}
      data-kind={row.kind}
    >
      {sortable ? (
        <button
          type="button"
          aria-label={t("manage.drag", { name })}
          className="flex w-7 cursor-grab touch-none justify-center self-stretch rounded-md text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      ) : (
        <span className="w-7" aria-hidden />
      )}
      {row.kind === "dashboard" && row.dashboard ? (
        <Link
          to={`/dashboards/${encodeURIComponent(row.id)}`}
          className="flex min-w-0 flex-1 flex-col rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 truncate text-sm font-semibold">
            <DashboardIconGlyph
              icon={row.icon}
              className="h-4 w-4 shrink-0 text-muted-foreground"
            />
            {name}
            <Badge>{t(`types.${row.dashboard.type}.label`)}</Badge>
          </span>
          {row.dashboard.description && (
            <span className="truncate text-xs text-muted-foreground">
              {row.dashboard.description}
            </span>
          )}
        </Link>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate py-1 text-sm font-semibold">
          {row.kind === "group" && (
            <DashboardIconGlyph
              icon={row.icon}
              className="h-4 w-4 shrink-0 text-muted-foreground"
            />
          )}
          <span
            className={cn(
              "truncate",
              row.kind === "section" && "uppercase tracking-wider",
            )}
          >
            {name}
          </span>
          <Badge>
            {row.kind === "section"
              ? t("structure.kinds.section")
              : t("structure.kinds.group")}
          </Badge>
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("manage.actions", { name })}
            className="h-9 w-9 text-muted-foreground"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onEdit}>
            <PencilLine />
            {t("actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
};

const Badge: FC<{ children: string }> = ({ children }) => (
  <span className="rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
    {children}
  </span>
);
