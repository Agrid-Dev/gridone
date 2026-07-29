import { useMemo, type FC } from "react";
import { NavLink, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { DashboardSummary } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseRangeParams, writeRangeParams } from "@/lib/timeRange";
import { cn } from "@/lib/utils";

/** Route-linked tab bar over the dashboards. Each trigger is a `NavLink`
 *  (`asChild`) so tabs are real deep-links and the active tab is the one in the
 *  URL; a trailing "+" links to the create form. Disabled during layout edit
 *  mode so switching dashboards can't discard unsaved changes. */
export const DashboardTabs: FC<{
  summaries: DashboardSummary[];
  activeId: string;
  disabled?: boolean;
}> = ({ summaries, activeId, disabled = false }) => {
  const { t } = useTranslation("dashboards");
  const [searchParams] = useSearchParams();

  // The viewing period is a page-level concern owned by the header, above the
  // tabs, so it carries across: switching dashboards keeps the chosen window.
  //
  // Rebuilt from the period alone rather than copying the query string, so
  // anything else this route comes to hold — `?edit=layout` already — stays
  // with the dashboard it belongs to instead of following the link.
  const search = useMemo(
    () =>
      writeRangeParams(
        new URLSearchParams(),
        parseRangeParams(searchParams),
      ).toString(),
    [searchParams],
  );

  return (
    <div
      className={cn(
        "flex items-center gap-2",
        disabled && "pointer-events-none opacity-60",
      )}
      aria-disabled={disabled}
    >
      <Tabs value={activeId} variant="pill">
        <TabsList aria-label={t("tabs.label")}>
          {summaries.map((dashboard) => (
            <TabsTrigger key={dashboard.id} value={dashboard.id} asChild>
              <NavLink
                to={{ pathname: `/dashboards/${dashboard.id}`, search }}
                title={dashboard.description ?? undefined}
              >
                {dashboard.name}
              </NavLink>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Button variant="ghost" size="icon" asChild>
        <NavLink to="/dashboards/new" aria-label={t("tabs.new")}>
          <Plus className="h-4 w-4" />
        </NavLink>
      </Button>
    </div>
  );
};
