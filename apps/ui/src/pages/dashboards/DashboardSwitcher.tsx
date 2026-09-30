import type { DashboardSummary } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { ResourceLink } from "@/components/ResourceLink";
import { ResourceSwitcher } from "@/components/ResourceSwitcher";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/contexts/AuthContext";
import { useDashboardNavigation } from "./useDashboardNavigation";

/** The active dashboard's name doubles as the menu for switching views. */
export function DashboardSwitcher({
  current,
  summaries,
  disabled = false,
}: {
  current: { id: string; name: string };
  summaries: DashboardSummary[];
  disabled?: boolean;
}) {
  const { t } = useTranslation("dashboards");
  const can = usePermissions();
  const onNavigate = useDashboardNavigation();

  return (
    <ResourceSwitcher
      current={current}
      resources={summaries}
      disabled={disabled}
      onNavigate={onNavigate}
      labels={{
        label: t("switcher.label"),
        search: t("switcher.search"),
        empty: t("switcher.empty"),
        current: t("switcher.current"),
      }}
      footer={
        can("dashboards:write") && (
          <Button variant="ghost" className="w-full justify-start" asChild>
            <ResourceLink to="/dashboards/new">
              <Plus aria-hidden className="h-4 w-4" />
              {t("switcher.new")}
            </ResourceLink>
          </Button>
        )
      }
    />
  );
}
