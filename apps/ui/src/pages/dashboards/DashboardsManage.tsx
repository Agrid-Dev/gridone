import { useState } from "react";
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
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Ellipsis, GripVertical, PencilLine, Plus, Trash2 } from "lucide-react";
import type { DashboardSummary } from "@gridone/sdk";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DashboardIconGlyph } from "@/lib/dashboardIcons";
import { cn } from "@/lib/utils";
import { DashboardForm, type DashboardFormValues } from "./DashboardForm";
import {
  useDashboards,
  useDeleteDashboard,
  useReorderDashboards,
  useUpdateDashboard,
} from "./useDashboards";

/** `/dashboards/manage` (Configuration): the list of dashboards as the
 *  supervision sidebar shows it — create, rename, describe, delete and
 *  reorder. Widgets and layout are edited on the dashboard itself. */
const DashboardsManageContent: FC = () => {
  const { t } = useTranslation(["dashboards", "common"]);
  const dashboards = useDashboards();
  const { reorderDashboards } = useReorderDashboards();
  const { updateDashboard } = useUpdateDashboard();
  const { deleteDashboard } = useDeleteDashboard();
  const [editing, setEditing] = useState<DashboardSummary | null>(null);
  const [deleting, setDeleting] = useState<DashboardSummary | null>(null);
  const ids = dashboards.map((dashboard) => dashboard.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    reorderDashboards(arrayMove(ids, from, to));
  };

  const handleEdit = async (values: DashboardFormValues) => {
    if (!editing) return;
    // Awaited so the form's submit stays disabled while in flight; a rejection
    // is swallowed here (the mutation's onError already toasts it).
    try {
      await updateDashboard(editing.id, {
        name: values.name,
        description: values.description,
        icon: values.icon,
      });
      setEditing(null);
    } catch {
      /* handled by the mutation's onError */
    }
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("manage.caption")}
        actions={
          <Button asChild>
            <Link to="/dashboards/new">
              <Plus />
              {t("switcher.new")}
            </Link>
          </Button>
        }
      />
      {dashboards.length === 0 ? (
        <ResourceEmpty
          resourceName={t("resourceName")}
          showCreate
          createTo="/dashboards/new"
          createLabel={t("common:empty.create.dashboards")}
        />
      ) : (
        <div className="space-y-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ol className="m-0 list-none space-y-1.5 p-0">
                {dashboards.map((dashboard) => (
                  <DashboardRow
                    key={dashboard.id}
                    dashboard={dashboard}
                    sortable={ids.length > 1}
                    onEdit={() => setEditing(dashboard)}
                    onDelete={() => setDeleting(dashboard)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          {ids.length > 1 && (
            <p className="text-xs leading-5 text-muted-foreground">
              {t("manage.orderHelp")}
            </p>
          )}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("edit.title")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <DashboardForm
              formId="dashboard-rename-form"
              defaultValues={{
                name: editing.name,
                description: editing.description ?? "",
                icon: editing.icon ?? null,
              }}
              submitLabel={t("edit.submit")}
              onSubmit={handleEdit}
              onCancel={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await deleteDashboard(deleting.id);
        }}
        title={t("common:deletion.title", {
          name: deleting?.name || deleting?.id,
        })}
        details={
          <>
            {t("delete.details", { name: deleting?.name })}{" "}
            {t("common:deletion.irreversible")}
          </>
        }
      />
    </section>
  );
};

const DashboardRow: FC<{
  dashboard: DashboardSummary;
  sortable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ dashboard, sortable, onEdit, onDelete }) => {
  const { t } = useTranslation("dashboards");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dashboard.id, disabled: !sortable });
  const name = dashboard.name || dashboard.id;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card py-1.5 pl-1 pr-2",
        isDragging && "relative z-10 shadow-lg ring-1 ring-border",
      )}
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
      <Link
        to={`/dashboards/${encodeURIComponent(dashboard.id)}`}
        className="flex min-w-0 flex-1 flex-col rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2 truncate text-sm font-semibold">
          <DashboardIconGlyph
            icon={dashboard.icon}
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
          {name}
        </span>
        {dashboard.description && (
          <span className="truncate text-xs text-muted-foreground">
            {dashboard.description}
          </span>
        )}
      </Link>
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

const DashboardsManage: FC = () => (
  <RequirePermission permission="dashboards:write">
    <ResourceBoundary resetKeys={[]}>
      <DashboardsManageContent />
    </ResourceBoundary>
  </RequirePermission>
);

export default DashboardsManage;
