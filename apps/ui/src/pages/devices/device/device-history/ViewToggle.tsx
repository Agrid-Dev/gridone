import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router";
import { ChartLine, Table } from "lucide-react";
import { cn } from "@/lib/utils";

const itemClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
    isActive
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

/** Chart / Table switch — a route-driven segmented control. Both views render
 *  the same selection over the same period, so the query string travels with
 *  the switch: this is a view change, not a navigation. */
export function ViewToggle() {
  const { t } = useTranslation("devices");
  const { search } = useLocation();

  return (
    <div className="inline-flex items-center rounded-md bg-muted p-1">
      <NavLink to={{ pathname: "chart", search }} className={itemClass}>
        <ChartLine className="h-4 w-4" aria-hidden />
        {t("history.chart")}
      </NavLink>
      <NavLink to={{ pathname: "table", search }} className={itemClass}>
        <Table className="h-4 w-4" aria-hidden />
        {t("history.table")}
      </NavLink>
    </div>
  );
}
