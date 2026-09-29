import { ResourceLink as Link } from "@/components/ResourceLink";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResourceEmpty } from "@/components/fallbacks/ResourceEmpty";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/contexts/AuthContext";
import { useSetFilterParams } from "@/hooks/useFilterParams";
import { Ellipsis, History, Plus, Terminal, Upload } from "lucide-react";
import { DevicesGrid } from "./DevicesGrid";
import { DevicesToolbar } from "./DevicesToolbar";
import { DevicesTabs } from "./views/DevicesTabs";
import { useDevicesPage } from "./useDevicesPage";

export default function DevicesList() {
  const { t } = useTranslation(["devices", "common"]);
  const can = usePermissions();
  const { clearAll } = useSetFilterParams();
  const {
    groups,
    typeCounts,
    total,
    faultyCount,
    shown,
    selectedTypes,
    health,
    connectionCounts,
    summaryLoading,
    zonePathOf,
    loading,
    error,
    hasFilters,
  } = useDevicesPage();

  return (
    <section className="space-y-4">
      <ResourceHeader
        flush
        title={t("devices.title")}
        actions={
          <DevicesActions
            canWrite={can("devices:write")}
            canCommand={can("devices:command")}
          />
        }
      />

      <DevicesTabs />

      <DevicesToolbar
        typeCounts={typeCounts}
        total={total}
        faultyCount={faultyCount}
        shown={shown}
        selectedTypes={selectedTypes}
        health={health}
        connectionCounts={connectionCounts}
        summaryLoading={summaryLoading}
        hasFilters={hasFilters}
      />

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
          title={hasFilters ? t("devices.search.empty") : undefined}
          onClearFilters={clearAll}
          showCreate={can("devices:write")}
          createTo="/devices/new"
          createLabel={t("devices.actions.add")}
        />
      ) : (
        <DevicesGrid groups={groups} zonePathOf={zonePathOf} />
      )}
    </section>
  );
}

/** At most two visible buttons, each gated on its own permission: Add on
 *  `devices:write`, New grouped command on `devices:command`. Command
 *  history sits behind an overflow menu with zone import for writers, and
 *  stays a plain button for everyone else. */
function DevicesActions({
  canWrite,
  canCommand,
}: {
  canWrite: boolean;
  canCommand: boolean;
}) {
  const { t } = useTranslation("devices");

  return (
    <>
      {canWrite ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label={t("devices.actions.more")}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/devices/commands">
                <History />
                {t("commands.subtitle")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/devices/zone-mapping/import">
                <Upload />
                {t("zoneImport.action")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button asChild variant="outline" size="sm">
          <Link to="/devices/commands">
            <History />
            {t("commands.subtitle")}
          </Link>
        </Button>
      )}
      {canWrite && (
        <Button asChild variant="outline" size="sm">
          <Link to="/devices/new">
            <Plus />
            {t("devices.actions.add")}
          </Link>
        </Button>
      )}
      {canCommand && (
        <Button asChild size="sm">
          <Link to="/devices/commands/new">
            <Terminal />
            {t("commands.newGroupedCommand")}
          </Link>
        </Button>
      )}
    </>
  );
}
