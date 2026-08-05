import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";
import { useDeviceFromRoute } from "@/hooks/useDevice";
import { useStandardTypes } from "@/hooks/useStandardTypes";
import { standardAttributeNames } from "@/lib/devices";
import { OTHER_KEY, deviceTypeKey } from "@/lib/deviceTypes";
import {
  DeviceHistoryProvider,
  useDeviceHistoryContext,
} from "./DeviceHistoryContext";
import { ExportMenu } from "./ExportMenu";
import { HistoryChartCard } from "./HistoryChartCard";
import { HistoryRangeControl } from "./HistoryRangeControl";
import { MetricPillBar } from "./MetricPillBar";
import HistoryEventsTable from "./HistoryEventsTable";

export default function DeviceHistoryPage() {
  const device = useDeviceFromRoute();
  const standardTypes = useStandardTypes();

  const attributeNames = useMemo(
    () => Object.keys(device.attributes ?? {}),
    [device],
  );

  // The device's standard-schema attributes drive the pill and timeline
  // defaults (see DeviceHistoryContext).
  const standardNames = useMemo(
    () => standardAttributeNames(device, standardTypes),
    [device, standardTypes],
  );

  const typeKey = deviceTypeKey(device);

  return (
    <DeviceHistoryProvider
      deviceId={device.id}
      attributeNames={attributeNames}
      standardAttributeNames={standardNames}
      deviceType={typeKey === OTHER_KEY ? undefined : typeKey}
    >
      <HistoryContent />
    </DeviceHistoryProvider>
  );
}

function HistoryContent() {
  const { t } = useTranslation(["devices", "common"]);
  const { series, isLoading, error } = useDeviceHistoryContext();

  if (error) {
    return (
      <ErrorFallback
        title={
          error instanceof Error ? error.message : t("common:errors.default")
        }
        showHomeLink={false}
      />
    );
  }

  if (isLoading) return <HistorySkeleton />;

  if (series.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <History />
          </EmptyMedia>
          <EmptyTitle>{t("common:common.noData")}</EmptyTitle>
          <EmptyDescription>
            {t("deviceDetails.noHistoryDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MetricPillBar />
        <div className="flex items-center gap-3">
          <HistoryRangeControl />
          <ExportMenu />
        </div>
      </div>
      <HistoryChartCard />
      <HistoryEventsTable />
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
