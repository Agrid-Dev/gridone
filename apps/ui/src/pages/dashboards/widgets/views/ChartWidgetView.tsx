import { useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { ParentSize } from "@visx/responsive";
import type { ChartWidgetConfig } from "@gridone/sdk";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeviceById } from "@/hooks/useDeviceById";
import { useTimeSeries } from "@/hooks/useTimeSeries";
import { toLabel } from "@/lib/textFormat";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import { holdLastValueUntil, singleSeriesChartProps } from "./chartSeries";

/** Vertical space the chart spends on chrome rather than the plot: the legend
 *  band above the panel, and the bottom margin the last panel adds for its time
 *  axis. Subtracted from the tile so the plot fills it exactly instead of
 *  overflowing — the chart sizes its panel in pixels, not to its parent. */
const LEGEND_HEIGHT = 26;
const TIME_AXIS_HEIGHT = 28;
const CHART_CHROME_HEIGHT = LEGEND_HEIGHT + TIME_AXIS_HEIGHT;

/** Centred one-liner for the states the chart itself has no rendering for. */
const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/**
 * Plots one attribute of one device over the dashboard period.
 *
 * Points are read raw — no aggregation — and the period comes from the URL, so
 * the widget owns no time state of its own. Which panel the series lands on
 * follows from its recorded data type, so a thermostat's temperature, its
 * on/off state and its mode each render in their natural form.
 */
export const ChartWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const { t } = useTranslation("dashboards");
  const { device_id: deviceId, attribute } = config as ChartWidgetConfig;
  const { query, refetchInterval } = useDashboardPeriod();

  const { data: device } = useDeviceById(deviceId);

  const { series, points, isLoading, error } = useTimeSeries({
    deviceId,
    attributeName: attribute,
    start: query.start,
    end: query.end,
    last: query.last,
    refetchInterval,
  });

  // Anchored to `points` so "now" is re-read when the query refetches, rather
  // than on every render — the trailing timestamp has to hold still between
  // renders or the line re-animates continuously.
  const spanned = useMemo(
    () =>
      holdLastValueUntil(points, query.end ? new Date(query.end) : new Date()),
    [points, query.end],
  );

  if (isLoading) {
    return (
      <div className="h-full p-3">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }
  if (error) return <Message>{t("widgets.chart.error")}</Message>;
  if (!series) return <Message>{t("widgets.chart.noSeries")}</Message>;
  if (points.length === 0)
    return <Message>{t("widgets.chart.noData")}</Message>;

  // A dashboard chart is read outside any device's page, so the series has to
  // name its device — the attribute alone doesn't say whose it is.
  const label = device
    ? `${device.name} — ${toLabel(attribute)}`
    : toLabel(attribute);

  const chartProps = singleSeriesChartProps(
    series.data_type,
    attribute,
    label,
    spanned,
  );

  return (
    <ParentSize>
      {({ height }) => {
        const panelHeight = Math.max(height - CHART_CHROME_HEIGHT, 0);
        return (
          <TimeSeriesChart
            {...chartProps}
            lineHeight={panelHeight}
            categoricalHeight={panelHeight}
          />
        );
      }}
    </ParentSize>
  );
};
