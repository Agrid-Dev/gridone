import { useState } from "react";
import type { FC } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Dashboard, DashboardSummary } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useDeleteDashboard, useUpdateDashboard } from "./useDashboards";

/** Header actions (⋮) for the active dashboard: rename (dialog reusing the
 *  shared form) and delete (confirmation). Deleting the active dashboard lands
 *  on the next one, or the empty state when it was the last. */
export const DashboardActions: FC<{
  dashboard: Dashboard;
  summaries: DashboardSummary[];
}> = ({ dashboard, summaries }) => {
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("actions.label")}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
            <Pencil className="h-4 w-4" />
            {t("actions.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
    </>
  );
};
