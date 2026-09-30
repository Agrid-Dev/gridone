import { useRef, useState } from "react";
import type { FC } from "react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2 } from "lucide-react";
import type { Widget } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const deleteTrigger = useRef<HTMLButtonElement>(null);
  const deletedIndex = useRef(0);
  const { removeWidget } = useRemoveWidget(dashboardId);

  const handleDelete = () => {
    deletedIndex.current = Array.from(
      document.querySelectorAll("[data-widget-actions]"),
    ).indexOf(deleteTrigger.current!);
    return removeWidget(widget.id);
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("widgets.actions.edit")}
              asChild
            >
              <Link to={`/dashboards/${dashboardId}/widgets/${widget.id}/edit`}>
                <Pencil aria-hidden className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("widgets.actions.edit")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={deleteTrigger}
              data-widget-actions
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              aria-label={t("widgets.actions.delete")}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("widgets.actions.delete")}</TooltipContent>
        </Tooltip>
      </div>

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
            deleteTrigger.current ??
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
