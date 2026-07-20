import { useState } from "react";
import type { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { PencilLine, Trash2, Wand2 } from "lucide-react";
import type { Dashboard, DashboardSummary } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DashboardForm, type DashboardFormValues } from "./DashboardForm";
import { AddWidgetButton } from "./widgets/AddWidgetButton";
import { useDeleteDashboard, useUpdateDashboard } from "./useDashboards";

/** Opt-in toolbox row: every edition action for the active dashboard in one
 *  place (rename, add widget, edit layout, delete), kept out of the navigation
 *  row so the two concerns don't mix and the grid only shifts when it's open. */
export const DashboardToolbox: FC<{
  dashboard: Dashboard;
  summaries: DashboardSummary[];
  hasWidgets: boolean;
  onEditLayout: () => void;
}> = ({ dashboard, summaries, hasWidgets, onEditLayout }) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const navigate = useNavigate();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { updateDashboard } = useUpdateDashboard();
  const { deleteDashboard } = useDeleteDashboard();

  const handleRename = async (values: DashboardFormValues) => {
    const ok = await updateDashboard(dashboard.id, {
      name: values.name,
      description: values.description,
    })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      setRenameOpen(false);
    }
  };

  const handleDelete = async () => {
    // After removing the active dashboard, the item that shifts into its slot
    // is the "next"; if it was last, fall back to the new last (previous).
    const idx = summaries.findIndex((s) => s.id === dashboard.id);
    const remaining = summaries.filter((s) => s.id !== dashboard.id);
    const target = remaining[idx] ?? remaining[remaining.length - 1];

    const ok = await deleteDashboard(dashboard.id)
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      return;
    }
    setDeleteOpen(false);
    navigate(target ? `/dashboards/${target.id}` : "/dashboards");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
      <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
        <PencilLine className="h-4 w-4" />
        {t("actions.rename")}
      </Button>
      {hasWidgets && (
        <Button variant="outline" size="sm" onClick={onEditLayout}>
          <Wand2 className="h-4 w-4" />
          {t("layout.edit")}
        </Button>
      )}
      {/* Add widget is the primary action — kept rightmost of the first three. */}
      <AddWidgetButton dashboardId={dashboard.id} />
      <Button
        variant="outline"
        size="sm"
        className="ml-auto text-destructive hover:text-destructive"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
        {t("actions.delete")}
      </Button>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rename.title")}</DialogTitle>
          </DialogHeader>
          <DashboardForm
            formId="dashboard-rename-form"
            defaultValues={{
              name: dashboard.name,
              description: dashboard.description ?? "",
            }}
            submitLabel={t("rename.submit")}
            onSubmit={handleRename}
            onCancel={() => setRenameOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.details", { name: dashboard.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
