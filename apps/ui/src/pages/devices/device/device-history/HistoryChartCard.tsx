import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Sigma, TriangleAlert } from "lucide-react";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { type TimeRange, rangeLabel } from "@/lib/timeRange";
import { cn } from "@/lib/utils";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";
import { StateTimeline } from "./StateTimeline";

/** Chart title per period: dedicated phrasings for the three segments, the
 *  generic range label otherwise ("Température — 3 dernières heures"). */
function useChartTitle(metricLabel: string, timeRange: TimeRange): string {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  if (timeRange.kind === "preset") {
    if (timeRange.preset === "1d")
      return t("history.chartTitle24h", { metric: metricLabel });
    if (timeRange.preset === "7d")
      return t("history.chartTitle7d", { metric: metricLabel });
    if (timeRange.preset === "1mo")
      return t("history.chartTitle30d", { metric: metricLabel });
  }
  return t("history.chartTitleRange", {
    metric: metricLabel,
    range: rangeLabel(timeRange, tCommon).toLocaleLowerCase(),
  });
}

/**
 * The history card: the active metric as a line chart, with the device's
 * state timelines beneath it. States render regardless of the active pill;
 * a device recording no numeric series gets the timelines alone.
 */
export function HistoryChartCard() {
  const { t } = useTranslation("devices");
  const {
    activeMetric,
    dataTypes,
    chartRows,
    stateAttributes,
    timeRange,
    hasTruncatedData,
    chartAveragedInterval,
    isLoading,
  } = useDeviceHistoryContext();
  const labelFor = useAttributeLabel();

  const timestamps = useMemo(
    () => chartRows.map((r) => new Date(r.timestamp)),
    [chartRows],
  );

  const metricValues = useMemo(
    () =>
      activeMetric
        ? chartRows.map((r) => r.values[activeMetric] as number | null)
        : [],
    [chartRows, activeMetric],
  );

  const metricSeries = useMemo(
    () =>
      activeMetric
        ? [{ key: activeMetric, label: labelFor(activeMetric) }]
        : [],
    [activeMetric, labelFor],
  );

  const metricLabel = activeMetric
    ? labelFor(activeMetric)
    : t("history.statesTitle");
  const title = useChartTitle(metricLabel, timeRange);

  const hasMetricData = metricValues.some((v) => v != null);
  const isIntMetric = activeMetric ? dataTypes[activeMetric] === "int" : false;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <span className="inline-flex items-center gap-3">
          {chartAveragedInterval && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sigma className="h-3.5 w-3.5" aria-hidden />
              {t("history.averagedNotice", {
                interval: chartAveragedInterval,
              })}
            </span>
          )}
          {hasTruncatedData && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-warning">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              {t("history.truncatedWarning")}
            </span>
          )}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <>
            {activeMetric &&
              (hasMetricData ? (
                <TimeSeriesChart
                  timestamps={timestamps}
                  lineSeries={isIntMetric ? [] : metricSeries}
                  lineValues={
                    isIntMetric ? {} : { [activeMetric]: metricValues }
                  }
                  intSeries={isIntMetric ? metricSeries : []}
                  intValues={
                    isIntMetric ? { [activeMetric]: metricValues } : {}
                  }
                />
              ) : (
                <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                  {t("history.noMetricData")}
                </p>
              ))}

            {stateAttributes.length > 0 && (
              <div
                className={cn(
                  "space-y-4",
                  activeMetric && "mt-6 border-t pl-12 pr-4 pt-5",
                )}
              >
                {stateAttributes.map((attr) => (
                  <StateTimeline
                    key={attr}
                    attr={attr}
                    label={labelFor(attr)}
                    rows={chartRows}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
