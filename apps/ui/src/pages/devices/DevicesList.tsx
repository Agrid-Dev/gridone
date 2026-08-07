import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { HealthFilter } from "@/components/HealthFilter";
import { ViewToggle } from "@/components/ViewToggle";
import { History, Plus, Terminal } from "lucide-react";
import {
  readStoredView,
  writeStoredView,
  type ResourceView,
} from "@/lib/viewPreference";
import { DevicesSummary } from "./DevicesSummary";
import { DeviceTypeChips } from "./DeviceTypeChips";
import { DevicesGrid } from "./DevicesGrid";
import { DevicesTable } from "./DevicesTable";
import { useDevicesPage } from "./useDevicesPage";

/** Cards first: the fleet is read at a glance far more often than compared
 *  column by column. The table stays one click away, and the choice sticks. */
const VIEW_STORAGE_KEY = "devices.view";
const DEFAULT_VIEW: ResourceView = "grid";

export default function DevicesList() {
  const { t } = useTranslation(["devices", "common"]);
  const [, setSearchParams] = useSearchParams();
  const can = usePermissions();
  const [view, setView] = useState<ResourceView>(
    () => readStoredView(VIEW_STORAGE_KEY) ?? DEFAULT_VIEW,
  );
  const {
    groups,
    typeCounts,
    total,
    connectionCounts,
    summaryLoading,
    assetNameOf,
    zonePathOf,
    loading,
    error,
    hasFilters,
  } = useDevicesPage();

  const changeView = (next: ResourceView) => {
    setView(next);
    writeStoredView(VIEW_STORAGE_KEY, next);
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("devices.title")}
        caption={t("devices.caption")}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/devices/commands">
                <History />
                {t("commands.subtitle")}
              </Link>
            </Button>
            {can("devices:write") && (
              <Button asChild variant="outline" size="sm">
                <Link to="/devices/new">
                  <Plus />
                  {t("devices.actions.add")}
                </Link>
              </Button>
            )}
            {can("devices:write") && (
              <Button asChild size="sm">
                <Link to="/devices/commands/new">
                  <Terminal />
                  {t("commands.newCommand")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {!summaryLoading && (
        <div className="text-sm text-muted-foreground">
          <DevicesSummary total={total} counts={connectionCounts} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <DeviceTypeChips counts={typeCounts} total={total} />
        <div className="ml-auto flex items-center gap-2">
          <HealthFilter />
          <ViewToggle value={view} onChange={changeView} />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <ResourceEmpty
          resourceName={t("common:common.device").toLowerCase()}
          filtered={hasFilters}
          onClearFilters={() => setSearchParams({})}
        />
      ) : view === "grid" ? (
        <DevicesGrid groups={groups} zonePathOf={zonePathOf} />
      ) : (
        <DevicesTable groups={groups} assetNameOf={assetNameOf} />
      )}
    </section>
  );
}
