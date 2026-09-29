import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router";
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
import { deviceAttributes, standardAttributeNames } from "@/lib/devices";
import type { AttributeFields } from "@/lib/faults";
import { OTHER_KEY, deviceTypeKey } from "@/lib/deviceTypes";
import {
  DeviceHistoryProvider,
  useDeviceHistoryContext,
} from "./DeviceHistoryContext";
import { AttributeSelector } from "./AttributeSelector";
import { ExportMenu } from "./ExportMenu";
import { HistoryRangeControl } from "./HistoryRangeControl";
import { TruncationWarning } from "./TruncationWarning";
import { ViewToggle } from "./ViewToggle";

/**
 * The device history layout: one attribute selection and one period feeding
 * two views — the chart and the table — switched by the routed toggle and
 * rendered through the outlet.
 */
export default function DeviceHistoryPage() {
  const device = useDeviceFromRoute();
  const standardTypes = useStandardTypes();

  const attributes = useMemo(
    () => deviceAttributes(device) as Record<string, AttributeFields>,
    [device],
  );

  // The device's standard-schema attributes are the first-visit selection
  // (see DeviceHistoryContext).
  const standardNames = useMemo(
    () => standardAttributeNames(device, standardTypes),
    [device, standardTypes],
  );

  const typeKey = deviceTypeKey(device);

  return (
    <DeviceHistoryProvider
      deviceId={device.id}
      deviceName={device.name || device.id}
      attributes={attributes}
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
        <ViewToggle />
        <div className="flex flex-wrap items-center gap-3">
          <AttributeSelector />
          <HistoryRangeControl />
          <ExportMenu />
        </div>
      </div>
      <TruncationWarning />
      <Outlet />
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-80" />
      </div>
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
