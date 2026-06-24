import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { cn } from "@/lib/utils";
import { toLabel } from "@/lib/textFormat";
import { BarChart3, Download, Loader2, Settings2, Table } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router";
import type { CurrentValue } from "./currentValues";
import {
  DeviceHistoryProvider,
  useDeviceHistoryContext,
} from "./DeviceHistoryContext";
import { TimeRangeSelect } from "./TimeRangeSelect";

export default function DeviceHistoryLayout() {
  const device = useDeviceFromRoute();
  const deviceId = device.id;

  useBreadcrumb([
    { to: `/devices/${deviceId}/history`, labelKey: "breadcrumb.history" },
  ]);

  const attributeNames = useMemo(
    () => Object.keys(device.attributes ?? {}),
    [device],
  );

  // Live value per attribute, timestamped at its last observation, so the
  // history chart can extend each series to the device's present state.
  const currentValues = useMemo(() => {
    const out: Record<string, CurrentValue> = {};
    for (const [name, attr] of Object.entries(device.attributes ?? {})) {
      if (attr.currentValue === null) continue;
      const timestamp = attr.lastUpdated ?? attr.lastChanged;
      if (!timestamp) continue;
      out[name] = { value: attr.currentValue, timestamp };
    }
    return out;
  }, [device]);

  return (
    <DeviceHistoryProvider
      deviceId={deviceId}
      attributeNames={attributeNames}
      currentValues={currentValues}
    >
      <div className="space-y-6">
        <HistoryToolbar deviceId={deviceId} />
      </div>
    </DeviceHistoryProvider>
  );
}

function HistoryToolbar({ deviceId }: { deviceId: string }) {
  const { t } = useTranslation(["devices", "common"]);
  const location = useLocation();
  const {
    availableAttributes,
    columnVisibility,
    handleVisibilityChange,
    isLoading,
    visibleAttributes,
    isDownloading,
    handleDownload,
  } = useDeviceHistoryContext();

  const isChart = location.pathname.endsWith("/chart");

  const visibleCount = availableAttributes.filter(
    (attr) => columnVisibility[attr] !== false,
  ).length;
  const allVisible = visibleCount === availableAttributes.length;

  const toggleAll = (visible: boolean) => {
    const next = { ...columnVisibility };
    for (const attr of availableAttributes) {
      next[attr] = visible;
    }
    handleVisibilityChange(next);
  };

  if (isLoading) return null;

  const hasTelemetry = availableAttributes.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewToggle deviceId={deviceId} search={location.search} />

        {hasTelemetry && (
          <div className="flex flex-wrap items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="mr-2 h-4 w-4" />
                  {t("common:common.columns")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>
                  {t("common:common.toggleColumns")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleAll(!allVisible);
                  }}
                >
                  {allVisible
                    ? t("common:common.unselectAll")
                    : t("common:common.selectAll")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {availableAttributes.map((attr) => (
                  <DropdownMenuCheckboxItem
                    key={attr}
                    checked={columnVisibility[attr] !== false}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) =>
                      handleVisibilityChange((prev) => ({
                        ...prev,
                        [attr]: !!checked,
                      }))
                    }
                  >
                    {toLabel(attr)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Badge variant="secondary" className="text-xs">
              {visibleCount} / {availableAttributes.length}
            </Badge>

            <TimeRangeSelect />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9"
                  disabled={isDownloading || visibleAttributes.length === 0}
                  onClick={() => handleDownload(isChart ? "png" : "csv")}
                >
                  {isDownloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t(
                  isChart
                    ? "deviceDetails.downloadPng"
                    : "deviceDetails.downloadCsv",
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <Outlet />
    </>
  );
}

/** Chart/Table view-mode toggle — a route-driven segmented control. Both
 *  render the same telemetry, so this is a view switch, not navigation. */
function ViewToggle({
  deviceId,
  search,
}: {
  deviceId: string;
  search: string;
}) {
  const { t } = useTranslation("devices");
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
      isActive
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="inline-flex items-center rounded-md bg-muted p-1">
      <NavLink
        to={{ pathname: `/devices/${deviceId}/history/chart`, search }}
        className={itemClass}
      >
        <BarChart3 className="h-4 w-4" />
        {t("deviceDetails.chart")}
      </NavLink>
      <NavLink
        to={{ pathname: `/devices/${deviceId}/history/table`, search }}
        className={itemClass}
      >
        <Table className="h-4 w-4" />
        {t("deviceDetails.table")}
      </NavLink>
    </div>
  );
}
