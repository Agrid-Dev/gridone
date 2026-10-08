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
  Ellipsis,
  Folder,
  GripVertical,
  LayoutGrid,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import type { DashboardStructure } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** The structure as the sidebar will show it, one row per entry: sections
 *  are headings, groups and dashboards rows, and a container's entries hang
 *  under a left rule. Drag a handle onto a dashboard to land before it, onto
 *  a group or a section to land last in it; a container carries its
 *  contents along. */
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
      <div className="rounded-xl border bg-card p-2">
        <Container parentId={null} ctx={ctx}>
          <AddGroup parentId={null} ctx={ctx} />
        </Container>
      </div>
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

/** Every entry as a row of the same height, so the eye reads the tree, not
 *  the boxes around it. */
const ROW =
  "flex h-11 items-center gap-2 rounded-md pl-1 pr-1 hover:bg-muted/50";

/** A container's children, one per row. The whole area is a drop zone
 *  landing last in the container. */
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

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-0.5 rounded-lg transition-colors",
        lit && "bg-accent/40 ring-1 ring-ring/40",
      )}
    >
      {items.map((row) =>
        row.kind === "dashboard" ? (
          <DashboardRow key={row.id} row={row} ctx={ctx} />
        ) : row.kind === "group" ? (
          <GroupNode key={row.id} row={row} ctx={ctx} />
        ) : (
          <SectionNode key={row.id} row={row} ctx={ctx} />
        ),
      )}
      {footer}
    </div>
  );
};

/** A container's entries, hanging under a left rule. */
const Nest: FC<{ children: ReactNode }> = ({ children: content }) => (
  <div className="ml-4 border-l pl-2">{content}</div>
);

/** A dashboard: the one entity here — its name opens it, its type rides
 *  along in plain text. */
const DashboardRow: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
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
        ROW,
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
        className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"
      >
        <KindIcon icon={row.icon} fallback={LayoutGrid} />
        <span className="truncate">{name}</span>
      </Link>
      {row.dashboard && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {t(`types.${row.dashboard.type}.label`)}
        </span>
      )}
      <Actions row={row} ctx={ctx} />
    </div>
  );
};

/** A group: a row like any entry, its dashboards — the tabs it will show —
 *  nested under it. */
const GroupNode: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
  const { t } = useTranslation("dashboards");
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: row.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: row.id });
  const name = row.label || row.id;
  const count = children(ctx.rows, row.id).length;
  return (
    <div
      ref={setDropRef}
      data-kind="group"
      className={cn(ctx.activeId === row.id && "opacity-40")}
    >
      <div className={ROW}>
        <Handle
          ref={setDragRef}
          label={t("manage.drag", { name })}
          attributes={attributes}
          listeners={listeners}
        />
        <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
          <KindIcon icon={row.icon} fallback={Folder} />
          <span className="truncate">{name}</span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {t("structure.count.tabs", { count })}
          </span>
        </span>
        <Actions row={row} ctx={ctx} />
      </div>
      <Nest>
        <Container parentId={row.id} ctx={ctx}>
          {count === 0 && (
            <p className="px-2 py-2 text-xs text-muted-foreground">
              {t("structure.empty.group")}
            </p>
          )}
        </Container>
      </Nest>
    </div>
  );
};

/** A section: the heading the sidebar will draw, its entries nested under
 *  it. */
const SectionNode: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
  const { t } = useTranslation("dashboards");
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: row.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: row.id });
  const name = row.label || row.id;
  const count = children(ctx.rows, row.id).length;
  return (
    <section
      ref={setDropRef}
      data-kind="section"
      aria-label={name}
      className={cn("pt-1", ctx.activeId === row.id && "opacity-40")}
    >
      <div className={cn(ROW, "h-10")}>
        <Handle
          ref={setDragRef}
          label={t("manage.drag", { name })}
          attributes={attributes}
          listeners={listeners}
        />
        <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-foreground/80">
          {name}
        </span>
        <span className="flex-1 shrink-0 text-xs text-muted-foreground">
          {t("structure.count.entries", { count })}
        </span>
        <Actions row={row} ctx={ctx} />
      </div>
      <Nest>
        <Container parentId={row.id} ctx={ctx}>
          {count === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              {t("structure.empty.section")}
            </p>
          )}
          <AddGroup parentId={row.id} ctx={ctx} />
        </Container>
      </Nest>
    </section>
  );
};

/** Add a group where it will land: last at the root, or last in a section. */
const AddGroup: FC<{ parentId: string | null; ctx: EditorContext }> = ({
  parentId,
  ctx,
}) => {
  const { t } = useTranslation("dashboards");
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="text-primary hover:text-primary"
        onClick={() => ctx.onCreate("group", parentId)}
      >
        <Plus />
        {t("structure.newGroup")}
      </Button>
    </div>
  );
};

/** An entry's own icon, else its kind's. */
const KindIcon: FC<{
  icon: Row["icon"];
  fallback: typeof LayoutGrid;
}> = ({ icon, fallback: Fallback }) =>
  icon ? (
    <DashboardIconGlyph
      icon={icon}
      className="h-4 w-4 shrink-0 text-muted-foreground"
    />
  ) : (
    <Fallback aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
  );

/** What travels under the pointer. */
const Ghost: FC<{ row: Row }> = ({ row }) => (
  <div className="flex w-max items-center gap-2 whitespace-nowrap rounded-md border bg-card px-3 py-2 text-sm font-medium shadow-lg">
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
    className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
    {...attributes}
    {...listeners}
  >
    <GripVertical aria-hidden className="size-4" />
  </button>
));
Handle.displayName = "Handle";

/** One menu per entry: editing and deleting stay a click away without
 *  lining every row with icons. */
const Actions: FC<{ row: Row; ctx: EditorContext }> = ({ row, ctx }) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const name = row.label || row.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          aria-label={t("manage.actions", { name })}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => ctx.onEdit(row)}>
          <PencilLine />
          {t("common:common.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => ctx.onDelete(row)}
        >
          <Trash2 />
          {t("common:common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
