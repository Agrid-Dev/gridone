import { useState } from "react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { TextWidgetConfig, Widget } from "@gridone/sdk";
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
import { TextWidgetForm, type TextWidgetFormValues } from "./TextWidgetForm";
import { useRemoveWidget, useUpdateWidget } from "../useWidgets";

/** Per-widget actions (edit / delete). Edit is offered for the `text` type
 *  (the only editable config today); other types can still be deleted. */
export const WidgetActions: FC<{ dashboardId: string; widget: Widget }> = ({
  dashboardId,
  widget,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { updateWidget } = useUpdateWidget(dashboardId);
  const { removeWidget } = useRemoveWidget(dashboardId);

  const isText = widget.type === "text";
  const textConfig = widget.config as TextWidgetConfig;

  const handleEdit = async (values: TextWidgetFormValues) => {
    const ok = await updateWidget(widget.id, {
      config: { type: "text", text: values.text, color: values.color },
    })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      setEditOpen(false);
    }
  };

  const handleDelete = async () => {
    const ok = await removeWidget(widget.id)
      .then(() => true)
      .catch(() => false);
    if (ok) {
      setDeleteOpen(false);
    }
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
          {isText && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              {t("widgets.actions.edit")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("widgets.actions.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {isText && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("widgets.editTitle")}</DialogTitle>
            </DialogHeader>
            <TextWidgetForm
              defaultValues={{ text: textConfig.text, color: textConfig.color }}
              submitLabel={t("widgets.editSubmit")}
              onSubmit={handleEdit}
              onCancel={() => setEditOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

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
