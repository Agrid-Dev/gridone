import { useState } from "react";
import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Folder, LayoutGrid, Plus } from "lucide-react";
import type {
  DashboardStructure,
  StructureGroup,
  StructureSection,
} from "@gridone/sdk";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { RequirePermission } from "@/components/RequirePermission";
import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardForm, type DashboardFormValues } from "./DashboardForm";
import { NodeForm, type NodeFormValues } from "./structure/NodeForm";
import { StructureEditor } from "./structure/StructureEditor";
import {
  build,
  dissolve,
  flatten,
  toUpdate,
  type Row,
} from "./structure/structureTree";
import {
  useDashboardStructure,
  useDeleteDashboard,
  useUpdateDashboard,
  useUpdateStructure,
} from "./useDashboards";

/** What the dialogs are open on: a node being edited, one being created at
 *  the root, or one about to be deleted. */
type ManageDialog =
  | { mode: "edit"; row: Row }
  | { mode: "create"; kind: "section" | "group"; parentId: string | null }
  | { mode: "delete"; row: Row };

/** `/dashboards/manage` (Configuration): the structure as the supervision
 *  sidebar shows it — create, rename, describe, delete, and arrange
 *  dashboards into groups (tabs) and sections (headings). Widgets and layout
 *  are edited on the dashboard itself. */
const DashboardsManageContent: FC = () => {
  const { t } = useTranslation(["dashboards", "common"]);
  const structure = useDashboardStructure();
  const { updateStructure } = useUpdateStructure();
  const { updateDashboard } = useUpdateDashboard();
  const { deleteDashboard } = useDeleteDashboard();
  const [dialog, setDialog] = useState<ManageDialog | null>(null);
  const close = () => setDialog(null);

  const save = async (next: DashboardStructure) => {
    // A rejection is swallowed here: the mutation's onError already toasts
    // it, and the cache keeps the structure as stored.
    try {
      await updateStructure(toUpdate(next));
    } catch {
      /* handled by the mutation's onError */
    }
  };

  const saveRows = (rows: Row[]) => save(build(rows));

  const handleEditDashboard = async (values: DashboardFormValues) => {
    if (dialog?.mode !== "edit") return;
    try {
      await updateDashboard(dialog.row.id, {
        name: values.name,
        description: values.description,
        icon: values.icon,
      });
      close();
    } catch {
      /* handled by the mutation's onError */
    }
  };

  const handleEditNode = async (values: NodeFormValues) => {
    if (dialog?.mode !== "edit") return;
    await saveRows(
      flatten(structure).map((row) =>
        row.id === dialog.row.id ? { ...row, ...values } : row,
      ),
    );
    close();
  };

  const handleCreateNode = async (values: NodeFormValues) => {
    if (dialog?.mode !== "create") return;
    const { kind, parentId } = dialog;
    const node: StructureSection | StructureGroup =
      kind === "section"
        ? { kind, id: "", label: values.label, items: [] }
        : { kind, id: "", ...values, dashboards: [] };
    // A section lands last at the root, a group last in its section.
    await save({
      items:
        parentId === null
          ? [...structure.items, node]
          : structure.items.map((item) =>
              item.kind === "section" &&
              item.id === parentId &&
              node.kind === "group"
                ? { ...item, items: [...item.items, node] }
                : item,
            ),
    });
    close();
  };

  const handleDelete = async () => {
    if (dialog?.mode !== "delete") return;
    if (dialog.row.kind === "dashboard") await deleteDashboard(dialog.row.id);
    else await saveRows(dissolve(flatten(structure), dialog.row.id));
  };

  const editing = dialog?.mode === "edit" ? dialog.row : null;
  const deleting = dialog?.mode === "delete" ? dialog.row : null;

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("title")}
        caption={t("manage.caption")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                setDialog({ mode: "create", kind: "section", parentId: null })
              }
            >
              <Plus />
              {t("structure.newSection")}
            </Button>
            <Button asChild>
              <Link to="/dashboards/new">
                <Plus />
                {t("switcher.new")}
              </Link>
            </Button>
          </>
        }
      />
      {structure.items.length > 0 && <Legend />}
      {structure.items.length === 0 ? (
        <ResourceEmpty
          resourceName={t("resourceName")}
          showCreate
          createTo="/dashboards/new"
          createLabel={t("common:empty.create.dashboards")}
        />
      ) : (
        <StructureEditor
          structure={structure}
          onChange={save}
          onEdit={(row) => setDialog({ mode: "edit", row })}
          onDelete={(row) => setDialog({ mode: "delete", row })}
          onCreate={(kind, parentId) =>
            setDialog({ mode: "create", kind, parentId })
          }
        />
      )}

      <Dialog
        open={dialog?.mode === "edit" || dialog?.mode === "create"}
        onOpenChange={(open) => !open && close()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "create"
                ? t(`structure.create.${dialog.kind}`)
                : editing?.kind === "dashboard"
                  ? t("edit.title")
                  : t(`structure.edit.${editing?.kind ?? "group"}`)}
            </DialogTitle>
          </DialogHeader>
          {editing?.kind === "dashboard" && editing.dashboard && (
            <DashboardForm
              formId="dashboard-rename-form"
              defaultValues={{
                name: editing.dashboard.name,
                type: editing.dashboard.type,
                description: editing.dashboard.description ?? "",
                icon: editing.dashboard.icon ?? null,
              }}
              lockType
              submitLabel={t("edit.submit")}
              onSubmit={handleEditDashboard}
              onCancel={close}
            />
          )}
          {editing && editing.kind !== "dashboard" && (
            <NodeForm
              kind={editing.kind}
              defaultValues={{ label: editing.label, icon: editing.icon }}
              submitLabel={t("edit.submit")}
              onSubmit={handleEditNode}
              onCancel={close}
            />
          )}
          {dialog?.mode === "create" && (
            <NodeForm
              kind={dialog.kind}
              submitLabel={t("common:common.create")}
              onSubmit={handleCreateNode}
              onCancel={close}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && close()}
        onConfirm={handleDelete}
        title={t("common:deletion.title", {
          name: deleting?.label || deleting?.id,
        })}
        details={
          deleting?.kind === "dashboard" ? (
            <>
              {t("delete.details", { name: deleting.label })}{" "}
              {t("common:deletion.irreversible")}
            </>
          ) : (
            t("structure.delete.details", { name: deleting?.label })
          )
        }
      />
    </section>
  );
};

/** The three kinds of entry, each marked the way the editor draws it. */
const Legend: FC = () => {
  const { t } = useTranslation("dashboards");
  const kinds = [
    { kind: "section", Icon: null },
    { kind: "group", Icon: Folder },
    { kind: "dashboard", Icon: LayoutGrid },
  ] as const;
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
      {kinds.map(({ kind, Icon }) => (
        <li key={kind} className="leading-6">
          {Icon && (
            <Icon aria-hidden className="mr-1.5 inline h-4 w-4 align-[-3px]" />
          )}
          <span
            className={cn(
              "mr-1.5 font-medium text-foreground",
              !Icon && "text-xs font-semibold uppercase tracking-wider",
            )}
          >
            {t(`manage.legend.${kind}.name`)}
          </span>
          {t(`manage.legend.${kind}.hint`)}
        </li>
      ))}
    </ul>
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
