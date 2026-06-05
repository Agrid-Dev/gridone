import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import type { Series } from "@/components/charts/TimeSeriesChart";
import { ConnectionStatusBadge } from "@/components/ConnectionStatusBadge";
import { relativeLastChanged } from "@/lib/utils";
import { useDeviceTimeSeries } from "@/hooks/useDeviceTimeSeries";
import type { DeviceAttribute } from "@/api/devices";

const CONNECTION_STATUS_METRIC = "connection_status";

export function ConnectionHistoryPanel({
  deviceId,
  attribute,
}: {
  deviceId: string;
  attribute: DeviceAttribute;
}) {
  const { t } = useTranslation("devices");
  const { t: tc } = useTranslation("common");
  const { pointsByMetric, isLoading } = useDeviceTimeSeries(
    deviceId,
    undefined,
    undefined,
    "1d",
  );

  const points = pointsByMetric[CONNECTION_STATUS_METRIC] ?? [];

  const stringSeries = useMemo<Series[]>(
    () => [
      {
        key: CONNECTION_STATUS_METRIC,
        label: t("deviceDetails.connectionHistory.title"),
      },
    ],
    [t],
  );

  const { timestamps, stringValues } = useMemo(() => {
    const ts: Date[] = [];
    const vals: (string | null)[] = [];
    for (const p of points) {
      ts.push(new Date(p.timestamp));
      vals.push(p.value as string | null);
    }
    return {
      timestamps: ts,
      stringValues: { [CONNECTION_STATUS_METRIC]: vals },
    };
  }, [points]);

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold text-foreground">
        {t("deviceDetails.connectionHistory.title")}
      </h3>
      <div className="flex items-center gap-2">
        <ConnectionStatusBadge
          status={attribute.currentValue as string | null}
        />
        <span className="text-sm text-muted-foreground">
          {t("deviceDetails.connectionHistory.since", {
            ago: relativeLastChanged(attribute.lastChanged, tc),
          })}
        </span>
      </div>
      {!isLoading && timestamps.length > 0 && (
        <TimeSeriesChart
          timestamps={timestamps}
          stringSeries={stringSeries}
          stringValues={stringValues}
        />
      )}
    </div>
  );
}
