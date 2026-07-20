import { useState } from "react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Widget, WidgetUpdateBody } from "@gridone/sdk";
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
import { WidgetForm, type WidgetFormValues } from "./WidgetForm";
import {
  useRemoveWidget,
  useUpdateWidget,
  useWidgetSchemas,
} from "../useWidgets";

/** Per-widget actions (edit / delete). Edit reuses the schema-driven widget
 *  form with the type locked — a widget's type is immutable after creation. */
export const WidgetActions: FC<{ dashboardId: string; widget: Widget }> = ({
  dashboardId,
  widget,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { updateWidget } = useUpdateWidget(dashboardId);
  const { removeWidget } = useRemoveWidget(dashboardId);
  const { data: schemas } = useWidgetSchemas();

  const handleEdit = async (values: WidgetFormValues) => {
    // Awaited so the form's submit stays disabled while in flight; a rejection
    // is swallowed here (the mutation's onError already toasts it) and just
    // keeps the dialog open.
    try {
      await updateWidget(widget.id, {
        title: values.title,
        config: values.config as WidgetUpdateBody["config"],
      });
      setEditOpen(false);
    } catch {
      /* handled by the mutation's onError */
    }
  };

  const handleDelete = () => {
    removeWidget(widget.id, { onSuccess: () => setDeleteOpen(false) });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 shadow-sm"
            aria-label={t("widgets.actions.label")}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            {t("widgets.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("widgets.actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("widgets.editTitle")}</DialogTitle>
          </DialogHeader>
          {schemas ? (
            <WidgetForm
              schemas={schemas}
              typeLocked
              defaultType={widget.type}
              defaultTitle={widget.title ?? undefined}
              defaultConfig={
                widget.config as unknown as Record<string, unknown>
              }
              submitLabel={t("widgets.editSubmit")}
              onSubmit={handleEdit}
              onCancel={() => setEditOpen(false)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("common:common.loading")}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("widgets.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("widgets.delete.details")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              {t("widgets.delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
