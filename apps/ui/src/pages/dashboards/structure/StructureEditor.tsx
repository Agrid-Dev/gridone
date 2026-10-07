import { forwardRef, useMemo, useState } from "react";
import type { FC, ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  FolderPlus,
  GripVertical,
  PencilLine,
  Rows3,
  Trash2,
} from "lucide-react";
import type { DashboardStructure } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { DashboardIconGlyph } from "@/lib/dashboardIcons";
import { cn } from "@/lib/utils";
import {
  ROOT_DROP_ID,
  build,
  children,
  dropId,
  dropTarget,
  flatten,
  relocate,
  type Row,
} from "./structureTree";

interface StructureEditorProps {
  structure: DashboardStructure;
  onChange: (next: DashboardStructure) => void;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
  /** Create a section (at the root) or a group (at the root or in a section). */
  onCreate: (kind: "section" | "group", parentId: string | null) => void;
}

/** Of everything under the pointer, the innermost: a dashboard inside a
 *  group inside a section is three droppables deep. Away from any, the
 *  nearest by centre. */
const innermost: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length === 0) return closestCenter(args);
  const area = (id: (typeof within)[number]["id"]) => {
    const rect = args.droppableRects.get(id);
    return rect ? rect.width * rect.height : Number.POSITIVE_INFINITY;
  };
  return [within.reduce((best, c) => (area(c.id) < area(best.id) ? c : best))];
};

/** The structure as the sidebar will show it: sections are headings whose
 *  entries hang under a left rule, groups are boxes stacked like entries,
 *  dashboards are tiles laid side by side like the tabs they become. Drag a
 *  handle onto a tile to land before it, onto a box or a section to land
 *  last in it; a container carries its contents along. */
export const StructureEditor: FC<StructureEditorProps> = ({
  structure,
  onChange,
  onEdit,
  onDelete,
  onCreate,
}) => {
  const { t } = useTranslation("dashboards");
  const rows = useMemo(() => flatten(structure), [structure]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const active = activeId ? rows.find((r) => r.id === activeId) : undefined;
  const target = activeId && overId ? dropTarget(rows, activeId, overId) : null;

  const onDragStart = ({ active }: DragStartEvent) =>
    setActiveId(String(active.id));
  const onDragOver = ({ over }: DragOverEvent) =>
    setOverId(over ? String(over.id) : null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    if (!over) return;
    const where = dropTarget(rows, String(active.id), String(over.id));
    if (!where) return;
    const next = relocate(rows, String(active.id), where);
    if (next.some((r, i) => r !== rows[i])) onChange(build(next));
  };

  const ctx: EditorContext = {
    rows,
    activeId,
    targetParentId: target ? target.parentId : undefined,
    onEdit,
    onDelete,
    onCreate,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={innermost}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
      }}
    >
      <Container parentId={null} ctx={ctx}>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreate("section", null)}
          >
            <Rows3 />
            {t("structure.newSection")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreate("group", null)}
          >
            <FolderPlus />
            {t("structure.newGroup")}
          </Button>
        </div>
      </Container>
      <p className="pt-2 text-xs leading-5 text-muted-foreground">
        {t("manage.orderHelp")}
      </p>
      <DragOverlay dropAnimation={null}>
        {active ? <Ghost row={active} /> : null}
      </DragOverlay>
    </DndContext>
  );
};

interface EditorContext {
  rows: Row[];
  activeId: string | null;
  /** The container that will receive the drop, lit while dragging. */
  targetParentId: string | null | undefined;
  onEdit: (row: Row) => void;
  onDelete: (row: Row) => void;
  onCreate: (kind: "section" | "group", parentId: string | null) => void;
}

/** A container's children, stacked: runs of dashboards side by side,
 *  groups and sections each on their own row. The whole area is a drop
 *  zone landing last in the container. */
const Container: FC<{
  parentId: string | null;
  ctx: EditorContext;
  children?: ReactNode;
}> = ({ parentId, ctx, children: footer }) => {
  const { setNodeRef } = useDroppable({
    id: parentId === null ? ROOT_DROP_ID : dropId(parentId),
  });
  const items = children(ctx.rows, parentId);
  const lit = ctx.activeId !== null && ctx.targetParentId === parentId;

  // Consecutive dashboards share one row of tiles.
  const runs: Row[][] = [];
  for (const row of items) {
    const last = runs[runs.length - 1];
    if (row.kind === "dashboard" && last?.[0]?.kind === "dashboard")
      last.push(row);
    else runs.push([row]);
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "space-y-2 rounded-lg transition-colors",
        lit && "bg-accent/40 ring-1 ring-ring/40",
      )}
    >
      {runs.map((run) =>
        run[0]?.kind === "dashboard" ? (
          <div key={run[0].id} className="flex flex-wrap gap-2">
            {run.map((row) => (
              <DashboardTile key={row.id} row={row} ctx={ctx} />
            ))}
          </div>
        ) : run[0]?.kind === "group" ? (
          <GroupBox key={run[0].id} row={run[0]} ctx={ctx} />
        ) : run[0] ? (
          <SectionBlock key={run[0].id} row={run[0]} ctx={ctx} />
        ) : null,
      )}
      {footer}
    </div>
  );
};

/** A dashboard: the one entity here, drawn as the tab it becomes — a tile
 *  with its icon, name and type, its actions in reach. */
const DashboardTile: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
  const { t } = useTranslation("dashboards");
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: row.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: row.id });
  const name = row.label || row.id;
  return (
    <div
      ref={setDropRef}
      data-kind="dashboard"
      className={cn(
        "flex items-center gap-1 rounded-md border bg-card pl-1 pr-1 shadow-sm",
        ctx.activeId === row.id && "opacity-40",
        isOver && "ring-2 ring-ring",
      )}
    >
      <Handle
        ref={setDragRef}
        label={t("manage.drag", { name })}
        attributes={attributes}
        listeners={listeners}
      />
      <Link
        to={`/dashboards/${encodeURIComponent(row.id)}`}
        className="flex min-w-0 items-center gap-2 py-2 pr-1 text-sm font-medium"
      >
        <DashboardIconGlyph
          icon={row.icon}
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <span className="max-w-48 truncate">{name}</span>
        {row.dashboard && (
          <Badge>{t(`types.${row.dashboard.type}.label`)}</Badge>
        )}
      </Link>
      <Actions row={row} ctx={ctx} />
    </div>
  );
};

/** A group: a box stacked like a sidebar entry, its dashboards as tiles
 *  inside — the tabs it will show. */
const GroupBox: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
  const { t } = useTranslation("dashboards");
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: row.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: row.id });
  const name = row.label || row.id;
  const empty = children(ctx.rows, row.id).length === 0;
  return (
    <div
      ref={setDropRef}
      data-kind="group"
      className={cn(
        "rounded-lg border bg-muted/30",
        ctx.activeId === row.id && "opacity-40",
      )}
    >
      <div className="flex items-center gap-1 border-b border-dashed pl-1 pr-1">
        <Handle
          ref={setDragRef}
          label={t("manage.drag", { name })}
          attributes={attributes}
          listeners={listeners}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2 py-2 text-sm font-semibold">
          <DashboardIconGlyph
            icon={row.icon}
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          <span className="truncate">{name}</span>
          <Badge>{t("structure.kinds.group")}</Badge>
        </span>
        <Actions row={row} ctx={ctx} />
      </div>
      <div className="p-2">
        <Container parentId={row.id} ctx={ctx}>
          {empty && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              {t("structure.empty.group")}
            </p>
          )}
        </Container>
      </div>
    </div>
  );
};

/** A section: a heading, its entries hanging under a left rule — the
 *  collapsible heading the sidebar will draw. */
const SectionBlock: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
  const { t } = useTranslation("dashboards");
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: row.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: row.id });
  const name = row.label || row.id;
  const empty = children(ctx.rows, row.id).length === 0;
  return (
    <section
      ref={setDropRef}
      data-kind="section"
      aria-label={name}
      className={cn("pt-2", ctx.activeId === row.id && "opacity-40")}
    >
      <div className="flex items-center gap-1 pl-1 pr-1">
        <Handle
          ref={setDragRef}
          label={t("manage.drag", { name })}
          attributes={attributes}
          listeners={listeners}
        />
        <span className="min-w-0 flex-1 truncate py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {name}
        </span>
        <Actions row={row} ctx={ctx} />
      </div>
      <div className="ml-4 border-l-2 border-border pl-3 pt-1">
        <Container parentId={row.id} ctx={ctx}>
          {empty && (
            <p className="px-1 py-1 text-xs text-muted-foreground">
              {t("structure.empty.section")}
            </p>
          )}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => ctx.onCreate("group", row.id)}
            >
              <FolderPlus />
              {t("structure.newGroup")}
            </Button>
          </div>
        </Container>
      </div>
    </section>
  );
};

/** What travels under the pointer. */
const Ghost: FC<{ row: Row }> = ({ row }) => (
  <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-lg">
    {row.kind !== "section" && (
      <DashboardIconGlyph icon={row.icon} className="h-4 w-4 shrink-0" />
    )}
    <span className={cn(row.kind === "section" && "uppercase tracking-wider")}>
      {row.label || row.id}
    </span>
  </div>
);

const Handle = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    attributes: ReturnType<typeof useDraggable>["attributes"];
    listeners: ReturnType<typeof useDraggable>["listeners"];
  }
>(({ label, attributes, listeners }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    className="flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
    {...attributes}
    {...listeners}
  >
    <GripVertical aria-hidden className="size-4" />
  </button>
));
Handle.displayName = "Handle";

const Actions: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
  const { t } = useTranslation("dashboards");
  const name = row.label || row.id;
  return (
    <span className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground"
        aria-label={t("structure.actions.edit", { name })}
        onClick={() => ctx.onEdit(row)}
      >
        <PencilLine />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label={t("structure.actions.delete", { name })}
        onClick={() => ctx.onDelete(row)}
      >
        <Trash2 />
      </Button>
    </span>
  );
};

const Badge: FC<{ children: string }> = ({ children }) => (
  <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {children}
  </span>
);
