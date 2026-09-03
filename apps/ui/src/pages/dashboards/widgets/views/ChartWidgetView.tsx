import { useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { ParentSize } from "@visx/responsive";
import {
  isGridoneError,
  isNotFound,
  type AggregationOperator,
  type ChartWidgetConfig,
  type DataPoint,
  type DataType,
} from "@gridone/sdk";
import TimeSeriesChart, {
  type TimeSeriesChartProps,
} from "@/components/charts/TimeSeriesChart";
import {
  AXIS_EXTRA,
  LEGEND_HEIGHT,
  PANEL_CHROME_HEIGHT,
} from "@/components/charts/TimeSeriesChart/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useMultiTimeSeries } from "@/hooks/useMultiTimeSeries";
import { UNTAGGED_GROUP_LABEL } from "@/lib/devices";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import {
  holdLastValueUntil,
  multiSeriesChartProps,
  singleSeriesChartProps,
  type NumericMark,
} from "./chartSeries";
import { useGroupedSpaceAggregate } from "./useGroupedSpaceAggregate";
import { useSpaceAggregate } from "./useSpaceAggregate";
import { useTargetDevices, type AttributeTarget } from "./useTargetDevices";

/** Centred one-liner for the states the chart itself has no rendering for. */
const Message: FC<{ children: string }> = ({ children }) => (
  <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
    {children}
  </div>
);

/** Full-height loading placeholder, shared by every view while its query runs. */
const ChartSkeleton: FC = () => (
  <div className="h-full p-3">
    <Skeleton className="h-full w-full" />
  </div>
);

/**
 * Lays out `chartProps` in the available height and renders the chart.
 *
 * `panelCount` is the number of categorical (bool/str) panels the caller's
 * series split into — 1 for a single reduced series or a shared numeric
 * panel, one per series for booleans/strings, each spending its own legend
 * band with the time axis paid once by the last.
 */
const ChartPanels: FC<{
  chartProps: TimeSeriesChartProps;
  panelCount: number;
}> = ({ chartProps, panelCount }) => (
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

/**
 * Reads a server-resolved space aggregation's error into the message it
 * means — shared by the whole-set and grouped shapes, which read the same
 * two statuses off the same kind of request.
 *
 * 404 means no device in the set has recorded history; 422 means the
 * target resolves to no device exposing the attribute (or a drifted,
 * mixed-type set).
 */
function useSpaceQueryErrorMessage() {
  const { t } = useTranslation("dashboards");
  return function queryErrorMessage(error: Error | null) {
    if (isNotFound(error))
      return <Message>{t("widgets.chart.noSeries")}</Message>;
    if (isGridoneError(error) && error.status === 422)
      return <Message>{t("widgets.chart.targetEmpty")}</Message>;
    return <Message>{t("widgets.chart.error")}</Message>;
  };
}

/** Worded caption for an aggregation operator, per role — the same wording
 *  the widget editor shows while picking it, rather than the raw wire code. */
function useAggCaptions() {
  const { t } = useTranslation("dashboards");
  return {
    time: (agg: AggregationOperator) =>
      t(
        `widgets.chart.agg.captions.${agg}` as "widgets.chart.agg.captions.avg",
      ),
    space: (agg: AggregationOperator) =>
      t(
        `widgets.chart.space.captions.${agg}` as "widgets.chart.space.captions.avg",
      ),
  };
}

/**
 * Plots one attribute of a device set over the dashboard period.
 *
 * The target's criteria resolve to devices at render time, and every resolved
 * device that exposes the attribute becomes a series on the one chart — or,
 * when the config carries a space aggregation, the set folds into a single
 * series. The period comes from the URL, so the widget owns no window of its
 * own; it does own how wide the buckets cut from that window should be, which
 * it passes through unchecked — a width the period cannot fill is the
 * endpoint's answer to give, not this view's to second-guess. Which panel the
 * series land on follows from the data type that comes back, so a
 * temperature, an on/off state and a mode each render in their natural form,
 * aggregated or not.
 */
export const ChartWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const {
    target,
    agg,
    interval,
    mark,
    space_agg: spaceAgg,
    group_by: groupBy,
  } = config as ChartWidgetConfig;
  // Three shapes, three different queries: one request per tag group, one
  // for the whole-set fold, or a per-device fan-out. Saving guarantees
  // space_agg comes with agg, and group_by comes with space_agg.
  if (groupBy && spaceAgg && agg)
    return (
      <GroupedChartView
        target={target}
        agg={agg}
        interval={interval}
        mark={mark}
        spaceAgg={spaceAgg}
        groupBy={groupBy}
      />
    );
  if (spaceAgg && agg)
    return (
      <SpaceChartView
        target={target}
        agg={agg}
        interval={interval}
        mark={mark}
        spaceAgg={spaceAgg}
      />
    );
  return (
    <FanOutChartView
      target={target}
      agg={agg ?? null}
      interval={interval}
      mark={mark}
    />
  );
};

/**
 * One space-aggregated series over the target: per-device time buckets fold
 * across the set server-side, and the single line that comes back says how it
 * was made — attribute, both operators, bucket width, and how many devices
 * contributed.
 */
const SpaceChartView: FC<{
  target: AttributeTarget;
  agg: AggregationOperator;
  interval?: string;
  mark?: NumericMark;
  spaceAgg: AggregationOperator;
}> = ({ target, agg, interval, mark = "line", spaceAgg }) => {
  const { t } = useTranslation("dashboards");
  const { query, refetchInterval } = useDashboardPeriod();
  const attributeLabel = useAttributeLabel();
  const captions = useAggCaptions();
  const queryErrorMessage = useSpaceQueryErrorMessage();

  // Space aggregation is bucketed by construction (raw is refused), so an
  // unbounded period cannot be cut into buckets — same rule as aggregating a
  // single device.
  const unbounded = !query.start && !query.last;

  const result = useSpaceAggregate({
    target,
    agg,
    interval,
    spaceAgg,
    start: query.start,
    end: query.end,
    last: query.last,
    enabled: !unbounded,
    refetchInterval,
  });

  if (unbounded) return <Message>{t("widgets.chart.unboundedPeriod")}</Message>;
  if (result.isLoading) return <ChartSkeleton />;
  if (result.error || !result.data) return queryErrorMessage(result.error);

  const data = result.data;
  // A bucket no series covered has no value. A line drops it and joins across
  // the gap; bars keep it, because the empty buckets are what set every bar's
  // width and leave the gap visible. Either way a window of nothing but empty
  // buckets is "no data", not a chart of blanks.
  const covered = data.points.filter((p) => p.value !== null);
  if (covered.length === 0)
    return <Message>{t("widgets.chart.noData")}</Message>;
  const points = (mark === "bar" ? data.points : covered).map((p) => ({
    timestamp: p.interval_start,
    value: p.value as DataPoint["value"],
  }));

  // No device count in the label: series_count is series with history, not
  // the resolved set, and the true contributor count varies per bucket. The
  // accurate counts live in the editor's coverage read and on each point.
  //
  // Two operators apply here — one per bucket, one across devices — but
  // repeating the same word twice ("avg · avg") told nobody which was which.
  // Identical operators collapse to the across-devices wording, since a mean
  // of means is still a mean; differing ones are both named.
  const label =
    agg === spaceAgg
      ? t("widgets.chart.space.seriesLabel", {
          attribute: attributeLabel(target.attribute),
          spaceAgg: captions.space(spaceAgg),
          interval: data.interval,
        })
      : t("widgets.chart.space.seriesLabelMixed", {
          attribute: attributeLabel(target.attribute),
          agg: captions.time(agg),
          spaceAgg: captions.space(spaceAgg),
          interval: data.interval,
        });
  const chartProps = singleSeriesChartProps(
    data.aggregation_data_type,
    "space",
    label,
    points,
    target.attribute,
    mark,
  );

  return <ChartPanels chartProps={chartProps} panelCount={1} />;
};

/** One reduced series per tag-value group, bucketed server-side by `groupBy`
 *  before `agg`/`spaceAgg` fold each bucket — same fold, one series per group. */
const GroupedChartView: FC<{
  target: AttributeTarget;
  agg: AggregationOperator;
  interval?: string;
  mark?: NumericMark;
  spaceAgg: AggregationOperator;
  groupBy: string;
}> = ({ target, agg, interval, mark = "line", spaceAgg, groupBy }) => {
  const { t } = useTranslation("dashboards");
  const { query, refetchInterval } = useDashboardPeriod();
  const captions = useAggCaptions();
  const queryErrorMessage = useSpaceQueryErrorMessage();

  const unbounded = !query.start && !query.last;

  const result = useGroupedSpaceAggregate({
    target,
    groupBy,
    agg,
    interval,
    spaceAgg,
    start: query.start,
    end: query.end,
    last: query.last,
    enabled: !unbounded,
    refetchInterval,
  });

  if (unbounded) return <Message>{t("widgets.chart.unboundedPeriod")}</Message>;
  if (result.isLoading) return <ChartSkeleton />;
  if (result.error || !result.data) return queryErrorMessage(result.error);

  const data = result.data;
  // Each group's label names its series — same operators-and-interval suffix
  // as the ungrouped space view, so a grouped chart still says how each line
  // was reduced, not just which tag value it is.
  const groupLabel = (group: string) =>
    group === UNTAGGED_GROUP_LABEL
      ? t("widgets.chart.groupBy.untagged")
      : group;
  const seriesLabel = (group: string) =>
    agg === spaceAgg
      ? t("widgets.chart.space.seriesLabelGrouped", {
          group: groupLabel(group),
          spaceAgg: captions.space(spaceAgg),
          interval: data.interval,
        })
      : t("widgets.chart.space.seriesLabelGroupedMixed", {
          group: groupLabel(group),
          agg: captions.time(agg),
          spaceAgg: captions.space(spaceAgg),
          interval: data.interval,
        });
  // Same rule as the ungrouped fold: a group with nothing but empty buckets
  // has nothing to draw and is dropped, while a group that does have values
  // keeps its empty buckets when drawn as bars — they carry the bar width and
  // the gaps.
  const series = data.groups
    .map((group) => ({
      key: group.label,
      label: seriesLabel(group.label),
      covered: group.points.filter((p) => p.value !== null),
      points: (mark === "bar"
        ? group.points
        : group.points.filter((p) => p.value !== null)
      ).map((p) => ({
        timestamp: p.interval_start,
        value: p.value as DataPoint["value"],
      })),
    }))
    .filter((s) => s.covered.length > 0);

  if (series.length === 0)
    return <Message>{t("widgets.chart.noData")}</Message>;

  const chartProps = multiSeriesChartProps(
    data.aggregation_data_type,
    series,
    target.attribute,
    mark,
  );

  // One categorical panel per group for booleans/strings, one shared line
  // panel otherwise.
  const panelCount =
    data.aggregation_data_type === "bool" ||
    data.aggregation_data_type === "str"
      ? series.length
      : 1;

  return <ChartPanels chartProps={chartProps} panelCount={panelCount} />;
};

/** One series per device of the set — the space_agg-less shape. */
const FanOutChartView: FC<{
  target: AttributeTarget;
  agg: AggregationOperator | null;
  interval?: string;
  mark?: NumericMark;
}> = ({ target, agg, interval, mark = "line" }) => {
  const { t } = useTranslation("dashboards");
  const { query, refetchInterval } = useDashboardPeriod();
  const attributeLabel = useAttributeLabel();
  const captions = useAggCaptions();

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
    interval,
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
  if (devicesLoading || seriesLoading) return <ChartSkeleton />;
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
    const name = `${deviceName(id)} — ${attributeLabel(target.attribute)}`;
    return agg && interval
      ? `${name} · ${captions.time(agg)} · ${interval}`
      : name;
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
    mark,
  );

  // Booleans and strings each take a panel per series, floats and ints share one.
  const panelCount =
    dataType === "bool" || dataType === "str" ? plotted.length : 1;

  return <ChartPanels chartProps={chartProps} panelCount={panelCount} />;
};
