import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { cn } from "@/lib/utils";
import { toLabel } from "@/lib/textFormat";
import {
  BarChart3,
  Check,
  Download,
  Loader2,
  Settings2,
  Table,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLocation } from "react-router";
import {
  DeviceHistoryProvider,
  useDeviceHistoryContext,
} from "./DeviceHistoryContext";
import { TimeRangeSelect } from "./TimeRangeSelect";

/** Above this attribute count, "select all" would trigger one points fetch
 *  per attribute (some AHUs expose ~600), so the action is disabled. */
export const MAX_SELECT_ALL_ATTRIBUTES = 20;

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

  return (
    <DeviceHistoryProvider deviceId={deviceId} attributeNames={attributeNames}>
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
  const canSelectAll = availableAttributes.length <= MAX_SELECT_ALL_ATTRIBUTES;

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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="mr-2 h-4 w-4" />
                  {t("common:common.columns")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                <Command>
                  <CommandInput
                    placeholder={t("common:common.searchAttributes")}
                  />
                  <CommandList>
                    <CommandEmpty>{t("common:common.noResults")}</CommandEmpty>
                    <CommandGroup>
                      {availableAttributes.map((attr) => (
                        <CommandItem
                          key={attr}
                          value={attr}
                          keywords={[toLabel(attr)]}
                          onSelect={() =>
                            handleVisibilityChange((prev) => ({
                              ...prev,
                              [attr]: columnVisibility[attr] === false,
                            }))
                          }
                        >
                          <Check
                            className={cn(
                              "h-4 w-4",
                              columnVisibility[attr] !== false
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {toLabel(attr)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                  <div className="border-t p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start font-normal"
                      disabled={!allVisible && !canSelectAll}
                      onClick={() => toggleAll(!allVisible)}
                    >
                      {allVisible
                        ? t("common:common.unselectAll")
                        : t("common:common.selectAll")}
                    </Button>
                    {!allVisible && !canSelectAll && (
                      <p className="px-2 pb-1 text-xs text-muted-foreground">
                        {t("common:common.selectAllDisabledHint")}
                      </p>
                    )}
                  </div>
                </Command>
              </PopoverContent>
            </Popover>

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
