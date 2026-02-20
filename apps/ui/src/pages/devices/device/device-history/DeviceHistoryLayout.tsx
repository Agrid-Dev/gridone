import { useMemo } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { useTranslation } from "react-i18next";
import { BarChart3, Settings2, Table } from "lucide-react";
import { Button, Tabs, TabsList, TabsTrigger } from "@/components/ui";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useDevice } from "@/hooks/useDevice";
import { ResourceHeader } from "@/components/ResourceHeader";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { toLabel } from "@/lib/textFormat";
import { DeviceHistoryProvider } from "./DeviceHistoryContext";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

export default function DeviceHistoryLayout() {
  const { t } = useTranslation();
  const { deviceId } = useParams<{ deviceId: string }>();
  const { data: device, isLoading, error } = useDevice(deviceId);

  const attributeNames = useMemo(
    () => Object.keys(device?.attributes ?? {}),
    [device],
  );

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="h-20 animate-pulse rounded-lg border border-slate-200 bg-white" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="overflow-hidden rounded-lg border">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full border-t" />
          ))}
        </div>
      </section>
    );
  }

  if (!device || !deviceId) return <NotFoundFallback />;
  if (error) return <ErrorFallback />;

  return (
    <DeviceHistoryProvider deviceId={deviceId} attributeNames={attributeNames}>
      <section className="space-y-6">
        <ResourceHeader
          resourceName={t("devices.title")}
          resourceNameLinksBack
          title={
            <>
              <Link to={`/devices/${deviceId}`} className="hover:underline">
                {device.name || device.id}
              </Link>
              {" / "}
              {t("deviceDetails.history")}
            </>
          }
        />

        <HistoryToolbar />
      </section>
    </DeviceHistoryProvider>
  );
}

function HistoryToolbar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    availableAttributes,
    columnVisibility,
    handleVisibilityChange,
    isLoading,
  } = useDeviceHistoryContext();

  const activeTab = location.pathname.endsWith("/chart") ? "chart" : "table";

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

  return (
    <>
      <div className="flex items-center justify-between">
        {availableAttributes.length > 0 && (
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="mr-2 h-4 w-4" />
                  {t("common.columns")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>
                  {t("common.toggleColumns")}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleAll(!allVisible);
                  }}
                >
                  {allVisible ? t("common.unselectAll") : t("common.selectAll")}
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
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            navigate(value === "chart" ? "chart" : "table", {
              replace: true,
              relative: "path",
            });
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
          </TabsList>
        </Tabs>
      </div>

      <Outlet />
    </>
  );
}
