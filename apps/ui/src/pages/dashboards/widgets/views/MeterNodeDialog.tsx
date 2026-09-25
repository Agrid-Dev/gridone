import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { Group } from "@visx/group";
import { Pie } from "@visx/shape";
import type { MeterTreeNode } from "@gridone/sdk";
import TimeSeriesChart from "@/components/charts/TimeSeriesChart";
import {
  CHART_COLORS,
  OTHER_COLOR,
  PANEL_CHROME_HEIGHT,
} from "@/components/charts/TimeSeriesChart/constants";
import { ResourceLink as Link } from "@/components/ResourceLink";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/formatValue";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import { singleSeriesChartProps } from "./chartSeries";
import {
  buildMeterTreeHierarchy,
  defaultCollapsed,
  pieSlices,
  type MeterTreeDatum,
} from "./meterTree";
import { useDailyConsumption } from "./useDailyConsumption";
import { useMeterNodeLabel } from "./useMeterNodeLabel";
import { useMeterTreeAttributes } from "./useMeterTreeAttributes";
import { useMeterTreeValues } from "./useMeterTreeValues";

const BAR_HEIGHT = 220;
/** What the chart occupies once drawn: its plot plus the legend above and the
 *  time axis below, so the placeholder holds exactly that space. */
const BAR_CHART_HEIGHT = BAR_HEIGHT + PANEL_CHROME_HEIGHT;
const PIE_SIZE = 168;

/** Categorical hues run out at the palette's length; past it, the smallest
 *  slices fold into one "other" rather than a generated colour. */
const MAX_SLICES = CHART_COLORS.length;

type Slice = { key: string; label: string; total: number; color: string };

const withUnit = (value: number, unit: string | null) =>
  unit ? `${fmt(value, 0)} ${unit}` : fmt(value, 0);

/**
 * Colours follow the child's position in the tree, so a slice keeps its hue
 * across periods; only when there are more children than hues do the smallest
 * fold into "other".
 */
function toSlices(
  children: MeterTreeDatum[],
  labelOf: (datum: MeterTreeDatum) => string,
  otherLabel: string,
): Slice[] {
  const slices = children.map((child, index) => ({
    key: child.key,
    label: labelOf(child),
    total: child.total as number,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  if (slices.length <= MAX_SLICES) return slices;
  const kept = new Set(
    [...slices]
      .sort((a, b) => b.total - a.total)
      .slice(0, MAX_SLICES - 1)
      .map((slice) => slice.key),
  );
  const shown = slices
    .filter((slice) => kept.has(slice.key))
    .map((slice, index) => ({ ...slice, color: CHART_COLORS[index] }));
  const other = slices
    .filter((slice) => !kept.has(slice.key))
    .reduce((sum, slice) => sum + slice.total, 0);
  return [
    ...shown,
    { key: "other", label: otherLabel, total: other, color: OTHER_COLOR },
  ];
}

const SharesPie: FC<{ slices: Slice[]; unit: string | null }> = ({
  slices,
  unit,
}) => {
  const whole = slices.reduce((sum, slice) => sum + slice.total, 0);
  const share = (value: number) => `${fmt((value / whole) * 100, 1)}%`;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={PIE_SIZE} height={PIE_SIZE} className="shrink-0">
        <Group top={PIE_SIZE / 2} left={PIE_SIZE / 2}>
          <Pie
            data={slices}
            pieValue={(slice) => slice.total}
            pieSort={null}
            outerRadius={PIE_SIZE / 2}
            innerRadius={PIE_SIZE / 4}
            padAngle={0.01}
          >
            {(pie) =>
              pie.arcs.map((arc) => (
                <path
                  key={arc.data.key}
                  d={pie.path(arc) ?? ""}
                  fill={arc.data.color}
                >
                  <title>{`${arc.data.label} — ${withUnit(arc.data.total, unit)} (${share(arc.data.total)})`}</title>
                </path>
              ))
            }
          </Pie>
        </Group>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {withUnit(slice.total, unit)}
            </span>
            <span className="w-14 text-right tabular-nums">
              {share(slice.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const DailyConsumptionChart: FC<{
  deviceId: string;
  attribute: string;
  scale: number;
  label: string;
}> = ({ deviceId, attribute, scale, label }) => {
  const { t } = useTranslation("dashboards");
  const period = useDashboardPeriod();
  const { points, unbounded, isLoading, error } = useDailyConsumption(
    deviceId,
    attribute,
    scale,
    { ...period.query, refetchInterval: period.refetchInterval },
  );

  if (unbounded) return <Message>{t("widgets.chart.unboundedPeriod")}</Message>;
  if (isLoading) return <Skeleton style={{ height: BAR_CHART_HEIGHT }} />;
  if (error) return <Message>{t("widgets.chart.error")}</Message>;
  if (!points?.some((point) => point.value !== null))
    return <Message>{t("widgets.chart.noData")}</Message>;

  return (
    <TimeSeriesChart
      {...singleSeriesChartProps(
        "float",
        "daily",
        label,
        points,
        attribute,
        "bar",
      )}
      lineHeight={BAR_HEIGHT}
    />
  );
};

const Message: FC<{ children: string }> = ({ children }) => (
  <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
);

/**
 * What a meter tree node measures, beyond the one figure its box shows: its
 * consumption day by day, and how it splits among its children.
 *
 * The device the meter belongs to is a secondary destination — its page shows
 * the raw index, not this consumption — so it sits in the footer rather than
 * being where a click on the node lands.
 */
export const MeterNodeDialog: FC<{
  node: MeterTreeNode | undefined;
  onClose: () => void;
}> = ({ node, onClose }) => {
  return (
    <Dialog open={!!node} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {node && <MeterNodeDetails node={node} />}
      </DialogContent>
    </Dialog>
  );
};

const MeterNodeDetails: FC<{ node: MeterTreeNode }> = ({ node }) => {
  const { t } = useTranslation("dashboards");
  const period = useDashboardPeriod();
  const labelOf = useMeterNodeLabel();
  // Only the node and its direct children are read: what lies deeper does
  // not change how this node splits among them.
  const folded = defaultCollapsed(node, 1);
  const attributes = useMeterTreeAttributes(node, folded);
  const { values } = useMeterTreeValues(
    node,
    { ...period.query, refetchInterval: period.refetchInterval },
    folded,
  );
  const datum = buildMeterTreeHierarchy(node, values, folded, attributes);
  const label = labelOf(datum);
  const slices = pieSlices(datum);
  const deviceId = datum.deviceId;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{label}</DialogTitle>
        <DialogDescription>
          {datum.total === null
            ? t("widgets.meterTree.noReading")
            : withUnit(datum.total, datum.unit)}
        </DialogDescription>
      </DialogHeader>
      {deviceId && datum.attribute && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            {t("widgets.meterTree.dailyConsumption")}
          </h3>
          <DailyConsumptionChart
            deviceId={deviceId}
            attribute={datum.attribute}
            scale={node.scale ?? 1}
            label={label}
          />
        </section>
      )}
      {slices.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            {t("widgets.meterTree.breakdown")}
          </h3>
          <SharesPie
            slices={toSlices(slices, labelOf, t("widgets.meterTree.other"))}
            unit={datum.unit}
          />
        </section>
      )}
      {deviceId && (
        <DialogFooter>
          <Link
            to={`/devices/${encodeURIComponent(deviceId)}`}
            className="text-sm text-primary hover:underline"
          >
            {t("widgets.meterTree.openDevice")}
          </Link>
        </DialogFooter>
      )}
    </>
  );
};
