import { ResourceBoundary } from "@/components/ResourceBoundary";
import { ResourceHeader } from "@/components/ResourceHeader";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
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
import { usePermissions } from "@/contexts/AuthContext";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { toLabel } from "@/lib/textFormat";
import {
  BarChart3,
  Download,
  Loader2,
  Settings2,
  Table,
  Terminal,
} from "lucide-react";
import { type FC, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import {
  DeviceHistoryProvider,
  useDeviceHistoryContext,
} from "./DeviceHistoryContext";
import { TimeRangeSelect } from "./TimeRangeSelect";

const DeviceHistoryLayoutContent: FC = () => {
  const { t } = useTranslation(["devices", "common"]);
  const can = usePermissions();
  const device = useDeviceFromRoute();
  const deviceId = device.id;

  const attributeNames = useMemo(
    () => Object.keys(device.attributes ?? {}),
    [device],
  );

  return (
    <DeviceHistoryProvider deviceId={deviceId} attributeNames={attributeNames}>
      <section className="space-y-6">
        <ResourceHeader
          resourceName={device.name || device.id}
          title={t("deviceDetails.history")}
          actions={
            can("devices:write") ? (
              <Button asChild size="sm">
                <Link to={`/devices/${deviceId}/commands/new`}>
                  <Terminal />
                  {t("commands.newCommand")}
                </Link>
              </Button>
            ) : null
          }
        />

        <HistoryToolbar />
      </section>
    </DeviceHistoryProvider>
  );
};

export default function DeviceHistoryLayout() {
  const { deviceId } = useParams<{ deviceId: string }>();
  return (
    <ResourceBoundary resetKeys={[deviceId]}>
      <DeviceHistoryLayoutContent />
    </ResourceBoundary>
  );
}

function HistoryToolbar() {
  const { t } = useTranslation(["devices", "common"]);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    availableAttributes,
    columnVisibility,
    handleVisibilityChange,
    isLoading,
    visibleAttributes,
    isDownloading,
    handleDownload,
  } = useDeviceHistoryContext();

  const activeTab = location.pathname.endsWith("/commands")
    ? "commands"
    : location.pathname.endsWith("/chart")
      ? "chart"
      : "table";

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

  const showTelemetryTools =
    activeTab !== "commands" && availableAttributes.length > 0;

  return (
    <>
      <div className="flex items-center justify-between">
        {showTelemetryTools ? (
          <div className="flex items-center gap-3">
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
                  onClick={() =>
                    handleDownload(activeTab === "chart" ? "png" : "csv")
                  }
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
                  activeTab === "chart"
                    ? "deviceDetails.downloadPng"
                    : "deviceDetails.downloadCsv",
                )}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <span />
        )}

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            navigate(
              { pathname: value, search: location.search },
              { replace: true, relative: "path" },
            );
          }}
        >
          <TabsList>
            <TabsTrigger value="table">
              <Table className="mr-1.5 h-4 w-4" />
              {t("deviceDetails.table")}
            </TabsTrigger>
            <TabsTrigger value="chart">
              <BarChart3 className="mr-1.5 h-4 w-4" />
              {t("deviceDetails.chart")}
            </TabsTrigger>
            <TabsTrigger value="commands">
              <Terminal className="mr-1.5 h-4 w-4" />
              {t("commands.title")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Outlet />
    </>
  );
}
