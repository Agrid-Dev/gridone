import type { FC } from "react";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Opens the widget editor page (form + live preview) for a new widget. */
export const AddWidgetButton: FC<{
  dashboardId: string;
  disabled?: boolean;
}> = ({ dashboardId, disabled = false }) => {
  const { t } = useTranslation("dashboards");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          aria-label={t("widgets.add")}
          disabled={disabled}
          asChild={!disabled}
        >
          {disabled ? (
            <Plus aria-hidden className="h-4 w-4" />
          ) : (
            <Link to={`/dashboards/${dashboardId}/widgets/new`}>
              <Plus aria-hidden className="h-4 w-4" />
            </Link>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t("widgets.add")}</TooltipContent>
    </Tooltip>
  );
};
