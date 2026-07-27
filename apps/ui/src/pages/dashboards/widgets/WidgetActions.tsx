import { useState } from "react";
import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Widget } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useRemoveWidget } from "../useWidgets";

/** Per-widget actions (edit / delete). Edit leads to the widget editor page,
 *  where the config form sits next to a live preview. */
export const WidgetActions: FC<{ dashboardId: string; widget: Widget }> = ({
  dashboardId,
  widget,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { removeWidget } = useRemoveWidget(dashboardId);

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
          <DropdownMenuItem asChild>
            <Link to={`/dashboards/${dashboardId}/widgets/${widget.id}/edit`}>
              <Pencil className="h-4 w-4" />
              {t("widgets.actions.edit")}
            </Link>
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
