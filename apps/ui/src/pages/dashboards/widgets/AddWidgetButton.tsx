import type { FC } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the widget editor page (form + live preview) for a new widget. */
export const AddWidgetButton: FC<{ dashboardId: string }> = ({
  dashboardId,
}) => {
  const { t } = useTranslation("dashboards");
  return (
    <Button size="sm" asChild>
      <Link to={`/dashboards/${dashboardId}/widgets/new`}>
        <Plus className="h-4 w-4" />
        {t("widgets.add")}
      </Link>
    </Button>
  );
};
