import { useRef, useState } from "react";
import type { FC } from "react";
import { ResourceLink as Link } from "@/components/ResourceLink";
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
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { useRemoveWidget } from "../useWidgets";

/** Per-widget actions (edit / delete). Edit leads to the widget editor page,
 *  where the config form sits next to a live preview. */
export const WidgetActions: FC<{ dashboardId: string; widget: Widget }> = ({
  dashboardId,
  widget,
}) => {
  const { t } = useTranslation(["dashboards", "common"]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const actionsTrigger = useRef<HTMLButtonElement>(null);
  const deletedIndex = useRef(0);
  const { removeWidget } = useRemoveWidget(dashboardId);

  const handleDelete = () => {
    deletedIndex.current = Array.from(
      document.querySelectorAll("[data-widget-actions]"),
    ).indexOf(actionsTrigger.current!);
    return removeWidget(widget.id);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={actionsTrigger}
            data-widget-actions
            variant="secondary"
            className="min-h-11 shadow-sm"
            aria-label={t("widgets.actions.label")}
          >
            <MoreVertical className="h-4 w-4" />
            {t("widgets.actions.label")}
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

      <ConfirmationDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const buttons = document.querySelectorAll<HTMLElement>(
            "[data-widget-actions]",
          );
          (
            actionsTrigger.current ??
            buttons[deletedIndex.current] ??
            buttons[deletedIndex.current - 1] ??
            document.querySelector<HTMLElement>("[data-page-title]")
          )?.focus({ preventScroll: true });
        }}
        title={t("common:deletion.title", {
          name: widget.title || t("widgets.untitled"),
        })}
        details={
          <>
            {t("widgets.delete.details")} {t("common:deletion.irreversible")}
          </>
        }
      />
    </>
  );
};
