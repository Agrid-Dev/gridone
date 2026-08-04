import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { HealthFilter } from "@/components/HealthFilter";
import { History, Plus, Terminal } from "lucide-react";
import { DevicesSummary } from "./DevicesSummary";
import { DeviceTypeChips } from "./DeviceTypeChips";
import { DevicesTable } from "./DevicesTable";
import { useDevicesPage } from "./useDevicesPage";

export default function DevicesList() {
  const { t } = useTranslation(["devices", "common"]);
  const [, setSearchParams] = useSearchParams();
  const can = usePermissions();
  const {
    groups,
    typeCounts,
    total,
    connectionCounts,
    summaryLoading,
    assetNameOf,
    loading,
    error,
    hasFilters,
  } = useDevicesPage();

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("devices.title")}
        caption={
          summaryLoading ? undefined : (
            <DevicesSummary total={total} counts={connectionCounts} />
          )
        }
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

      <div className="flex flex-wrap items-center gap-3">
        <DeviceTypeChips counts={typeCounts} total={total} />
        <div className="ml-auto">
          <HealthFilter />
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
      ) : groups.length > 0 ? (
        <DevicesTable groups={groups} assetNameOf={assetNameOf} />
      ) : (
        <ResourceEmpty
          resourceName={t("common:common.device").toLowerCase()}
          filtered={hasFilters}
          onClearFilters={() => setSearchParams({})}
        />
      )}
    </section>
  );
}
