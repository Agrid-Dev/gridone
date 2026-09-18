import { useRef, useState } from "react";
import type { FC } from "react";
import { useNavigate, useSearchParams } from "react-router";
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
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
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
  const [params] = useSearchParams();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const { updateDashboard } = useUpdateDashboard();
  const { deleteDashboard } = useDeleteDashboard();

  const handleRename = async (values: DashboardFormValues) => {
    // Awaited so the form's submit stays disabled while in flight; a rejection
    // is swallowed here (the mutation's onError already toasts it).
    try {
      await updateDashboard(dashboard.id, {
        name: values.name,
        description: values.description,
      });
      setRenameOpen(false);
    } catch {
      /* handled by the mutation's onError */
    }
  };

  const handleDelete = async () => {
    // After removing the active dashboard, the item that shifts into its slot
    // is the "next"; if it was last, fall back to the new last (previous).
    const idx = summaries.findIndex((s) => s.id === dashboard.id);
    const remaining = summaries.filter((s) => s.id !== dashboard.id);
    const target = remaining[idx] ?? remaining[remaining.length - 1];

    await deleteDashboard(dashboard.id);
    const search = new URLSearchParams();
    for (const key of ["last", "start", "end"]) {
      const value = params.get(key);
      if (value) search.set(key, value);
    }
    navigate(
      {
        pathname: target ? `/dashboards/${target.id}` : "/dashboards",
        search: search.toString(),
      },
      { replace: true },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        onClick={() => setRenameOpen(true)}
      >
        <PencilLine className="h-4 w-4" />
        {t("actions.rename")}
      </Button>
      {hasWidgets && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={onEditLayout}
        >
          <Wand2 className="h-4 w-4" />
          {t("layout.edit")}
        </Button>
      )}
      {/* Add widget is the primary action — kept rightmost of the first three. */}
      <AddWidgetButton dashboardId={dashboard.id} />
      <Button
        variant="outline"
        size="sm"
        className="ml-auto min-h-11 text-destructive hover:text-destructive"
        ref={deleteTrigger}
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

      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (
            deleteTrigger.current ??
            document.querySelector<HTMLElement>("[data-page-title]") ??
            document.getElementById("main-content")
          )?.focus({ preventScroll: true });
        }}
        title={t("common:deletion.title", {
          name: dashboard.name || dashboard.id,
        })}
        details={
          <>
            {t("delete.details", { name: dashboard.name })}{" "}
            {t("common:deletion.irreversible")}
          </>
        }
      />
    </div>
  );
};
