import { useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { ParentSize } from "@visx/responsive";
import type { ChartWidgetConfig, DataType } from "@gridone/sdk";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import {
  AXIS_EXTRA,
  LEGEND_HEIGHT,
  PANEL_CHROME_HEIGHT,
} from "@/components/charts/TimeSeriesChart/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { useMultiTimeSeries } from "@/hooks/useMultiTimeSeries";
import { toLabel } from "@/lib/textFormat";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import { holdLastValueUntil, multiSeriesChartProps } from "./chartSeries";
import { useTargetDevices } from "./useTargetDevices";

/** Centred one-liner for the states the chart itself has no rendering for. */
const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/**
 * Plots one attribute of a device set over the dashboard period.
 *
 * The target's criteria resolve to devices at render time, and every resolved
 * device that exposes the attribute becomes a series on the one chart. The
 * period comes from the URL, so the widget owns no time state of its own —
 * not even the bucket width when aggregating, which the API resolves from the
 * window it is given. Which panel the series land on follows from the data
 * type that comes back, so a temperature, an on/off state and a mode each
 * render in their natural form, aggregated or not.
 */
export const ChartWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const { t } = useTranslation("dashboards");
  const { target, agg } = config as ChartWidgetConfig;
  const { query, refetchInterval } = useDashboardPeriod();

  // Buckets are cut from a window, so there is nothing to cut when the period
  // is unbounded — the "all time" preset resolves to no start, end or last.
  // Raw reads accept that and return the whole history, aggregation cannot, so
  // the request is not sent rather than left to fail as though the attribute
  // were at fault.
  const unbounded = !!agg && !query.start && !query.last;

  const {
    devices,
    isLoading: devicesLoading,
    error: devicesError,
  } = useTargetDevices(target, refetchInterval);
  const deviceIds = useMemo(() => devices.map((d) => d.id), [devices]);

  const { results, isLoading: seriesLoading } = useMultiTimeSeries({
    deviceIds,
    attributeName: target.attribute,
    start: query.start,
    end: query.end,
    last: query.last,
    agg,
    enabled: !unbounded,
    refetchInterval,
  });

  // The series worth drawing, with raw points held to the window end: a point
  // is recorded only on change, so a steady attribute's last value has to
  // stretch to the end to draw at all. Buckets already tile the window, so
  // holding there would invent one that was never computed.
  //
  // Memoized against `results` (stable between fetches) so "now" is re-read
  // when a query refetches rather than on every render — the trailing
  // timestamp has to hold still or the lines re-animate continuously.
  const plotted = useMemo(() => {
    const end = query.end ? new Date(query.end) : new Date();
    return results
      .filter((r) => r.series && r.dataType && r.points.length > 0)
      .map((r) => ({
        deviceId: r.deviceId,
        dataType: r.dataType as DataType,
        interval: r.interval,
        points: agg ? r.points : holdLastValueUntil(r.points, end),
      }));
  }, [results, agg, query.end]);

  if (unbounded) return <Message>{t("widgets.chart.unboundedPeriod")}</Message>;
  if (devicesLoading || seriesLoading) {
    return (
      <div className="h-full p-3">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }
  if (devicesError) return <Message>{t("widgets.chart.error")}</Message>;
  if (devices.length === 0)
    return <Message>{t("widgets.chart.targetEmpty")}</Message>;
  if (plotted.length === 0) {
    if (results.some((r) => r.error))
      return <Message>{t("widgets.chart.error")}</Message>;
    if (results.every((r) => !r.series))
      return <Message>{t("widgets.chart.noSeries")}</Message>;
    return <Message>{t("widgets.chart.noData")}</Message>;
  }

  // Saving enforces one data type across the set, but a criteria target is
  // dynamic — a device re-driven after the save can drift the set apart. Two
  // panels would chart the same attribute twice, so the drift is named
  // instead.
  const dataTypes = [...new Set(plotted.map((s) => s.dataType))];
  if (dataTypes.length > 1)
    return <Message>{t("widgets.chart.mixedTypes")}</Message>;
  const [dataType] = dataTypes;

  const deviceName = (id: string) =>
    devices.find((d) => d.id === id)?.name ?? id;

  // A dashboard chart is read outside any device's page, so a lone series has
  // to name its device — the attribute alone doesn't say whose it is — and an
  // aggregated one also says how: without it, a chart re-buckets when the
  // period changes with nothing to explain why it changed shape. With several
  // devices the attribute is the widget's subject, so each series carries just
  // its device's name and the legend stays one line per device.
  const label = (id: string, interval: string | null) => {
    if (plotted.length > 1) return deviceName(id);
    const name = `${deviceName(id)} — ${toLabel(target.attribute)}`;
    return agg && interval ? `${name} · ${agg} · ${interval}` : name;
  };

  // Aggregation can change the data type — `count` yields ints whatever went
  // in — so the panel follows what came back, not what was recorded.
  const chartProps = multiSeriesChartProps(
    dataType,
    plotted.map((s) => ({
      key: s.deviceId,
      label: label(s.deviceId, s.interval),
      points: s.points,
    })),
    target.attribute,
  );

  // Booleans and strings each take a panel per series, floats and ints share
  // one — the height budget splits over however many panels that makes, each
  // spending its own legend band, with the time axis paid once by the last.
  const panelCount =
    dataType === "bool" || dataType === "str" ? plotted.length : 1;

  return (
    <ParentSize>
      {({ height }) => {
        const panelHeight = Math.max(
          (height - panelCount * LEGEND_HEIGHT - AXIS_EXTRA) / panelCount,
          0,
        );
        return (
          <TimeSeriesChart
            {...chartProps}
            lineHeight={Math.max(height - PANEL_CHROME_HEIGHT, 0)}
            categoricalHeight={panelHeight}
          />
        );
      }}
    </ParentSize>
  );
};
