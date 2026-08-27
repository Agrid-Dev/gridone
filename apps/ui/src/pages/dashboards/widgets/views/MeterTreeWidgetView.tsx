import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { Group } from "@visx/group";
import { Tree, hierarchy } from "@visx/hierarchy";
import type { HierarchyPointNode } from "@visx/hierarchy/lib/types";
import { ParentSize } from "@visx/responsive";
import type { MeterTreeWidgetConfig } from "@gridone/sdk";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/formatValue";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import { buildMeterTreeHierarchy, type MeterTreeDatum } from "./meterTree";
import { useMeterTreeValues } from "./useMeterTreeValues";

/** Box drawn per node: wide enough for a circuit name plus its figures. */
const NODE_W = 156;
const NODE_H = 38;
/** Gaps between boxes, enough that the elbow links read as connections. */
const GAP_X = 56;
const GAP_Y = 7;
const ROW = NODE_H + GAP_Y;
const PADDING = 12;
const MAX_LABEL = 20;
/** Thinnest an edge may be drawn: a 0.2% circuit must still show a connection. */
const EDGE_MIN = 1;
/** Thickest, reserved for the trunk. */
const EDGE_MAX = 11;

/** A share reads better as a percentage than a fraction. */
const asPercent = (ratio: number | null) =>
  ratio === null ? null : `${fmt(ratio * 100, 1)}%`;

/**
 * How thick to draw the edge feeding a node.
 *
 * Weighted by the node's share of the *building*, not of its parent: share of
 * parent is not monotonic down the tree, so a small branch's large circuit would
 * out-draw the trunk feeding it. Share of the total only ever decreases as you
 * descend, which is what makes the diagram read as a distribution network.
 *
 * Square-rooted because a linear map spends almost all its range on the top two
 * or three circuits and renders everything else identically hairline. Clamped at
 * 100% so a mis-scaled meter claiming more than the whole building gets a full
 * edge rather than an ever-growing one — its own row is already flagged red.
 */
function edgeWidth(share: number | null): number {
  if (share === null) return EDGE_MIN;
  const clamped = Math.min(Math.max(share, 0), 1);
  return EDGE_MIN + (EDGE_MAX - EDGE_MIN) * Math.sqrt(clamped);
}

/**
 * Elbow link: out of the parent's right edge, across, into the child's left.
 *
 * Drawn by hand rather than pulled from `@visx/shape` — one path expression is
 * cheaper than another dependency, and a right angle suits a distribution board
 * better than a curve: it reads like the single-line diagram it describes.
 *
 * The tree is laid out left-to-right, so visx's `x` is vertical here and its
 * `y` horizontal.
 */
function elbow(
  source: HierarchyPointNode<MeterTreeDatum>,
  target: HierarchyPointNode<MeterTreeDatum>,
): string {
  const midX = (source.y + NODE_W + target.y) / 2;
  return `M${source.y + NODE_W},${source.x} H${midX} V${target.x} H${target.y}`;
}

/** Whether a node's number is a fault rather than just a small figure. */
function isFaulty(datum: MeterTreeDatum): boolean {
  return datum.kind === "residual"
    ? (datum.negative ?? false)
    : datum.state === "reset";
}

const NodeBox: FC<{
  node: HierarchyPointNode<MeterTreeDatum>;
  label: string;
  noReading: string;
  incompleteMark: string;
}> = ({ node, label, noReading, incompleteMark }) => {
  const datum = node.data;
  const residual = datum.kind === "residual";
  const faulty = isFaulty(datum);

  return (
    <Group top={node.x - NODE_H / 2} left={node.y}>
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={6}
        strokeWidth={1}
        className={
          faulty
            ? "fill-destructive/10 stroke-destructive"
            : residual
              ? "fill-muted stroke-border"
              : "fill-card stroke-border"
        }
      />
      <text
        x={10}
        y={15}
        className={
          residual
            ? "fill-muted-foreground text-[11px] italic"
            : "fill-foreground text-[11px] font-medium"
        }
      >
        {label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label}
      </text>
      <text
        x={10}
        y={30}
        className={
          faulty
            ? "fill-destructive text-[12px] font-semibold tabular-nums"
            : "fill-foreground text-[12px] tabular-nums"
        }
      >
        {datum.total === null ? noReading : fmt(datum.total, 0)}
      </text>
      <text
        x={NODE_W - 10}
        y={30}
        textAnchor="end"
        className="fill-muted-foreground text-[11px] tabular-nums"
      >
        {asPercent(datum.ratioOfParent) ?? ""}
      </text>
      {residual && datum.incomplete && <title>{incompleteMark}</title>}
    </Group>
  );
};

const TreeCanvas: FC<{ root: MeterTreeDatum; width: number }> = ({
  root,
  width,
}) => {
  const { t } = useTranslation("dashboards");
  const data = hierarchy<MeterTreeDatum>(root);

  // One row per node, in reading order, rather than the layout's default of
  // centring each parent over its children: centring buries the root halfway
  // down a canvas taller than the tile, and the root is the figure everything
  // else is a share of. Sized from the tree, not the tile — a board has as many
  // rows as it has circuits — so the container scrolls instead of shrinking
  // every label past legibility.
  const rows = data.descendants().length;
  const innerH = rows * ROW;
  const innerW = (data.height + 1) * (NODE_W + GAP_X);

  return (
    <svg
      width={Math.max(innerW + PADDING * 2, width)}
      height={innerH + PADDING * 2}
    >
      <Group top={PADDING} left={PADDING}>
        <Tree<MeterTreeDatum> root={data} size={[innerH, innerW - NODE_W]}>
          {(tree) => {
            // `eachBefore` is depth-first, parents before children — the order
            // the rows are read in. Reassigning `x` here keeps visx responsible
            // for the horizontal layout and the link topology.
            let row = 0;
            tree.eachBefore((node) => {
              node.x = row * ROW + NODE_H / 2;
              row += 1;
            });
            return (
              <Group>
                {tree.links().map((link) => (
                  <path
                    key={`${link.source.data.key}->${link.target.data.key}`}
                    d={elbow(link.source, link.target)}
                    className="stroke-border"
                    strokeWidth={edgeWidth(link.target.data.shareOfTotal)}
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
                {tree.descendants().map((node) => (
                  <NodeBox
                    key={node.data.key}
                    node={node}
                    label={
                      node.data.kind === "residual"
                        ? t("widgets.meterTree.unmetered")
                        : node.data.label
                    }
                    noReading={t("widgets.meterTree.noReading")}
                    incompleteMark={t("widgets.meterTree.incomplete")}
                  />
                ))}
              </Group>
            );
          }}
        </Tree>
      </Group>
    </svg>
  );
};

/**
 * Sub-metering tree: consumption per circuit over the dashboard period, drawn
 * as the distribution tree it describes.
 *
 * Shares are of the parent's own meter, so children that measure more than the
 * feeder above them add up past 100% and the parent's remainder goes negative.
 * That disagreement is the point: it means the hierarchy or the meters are
 * wrong, and normalising it away would leave a tree that looks tidy and lies.
 */
export const MeterTreeWidgetView: FC<{ config: unknown }> = ({ config }) => {
  const { t } = useTranslation("dashboards");
  const { root } = config as MeterTreeWidgetConfig;
  const period = useDashboardPeriod();
  const { values, loading } = useMeterTreeValues(root, {
    ...period.query,
    refetchInterval: period.refetchInterval,
  });

  if (!root) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
        {t("widgets.meterTree.empty")}
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    );
  }

  const annotated = buildMeterTreeHierarchy(root, values);
  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <ParentSize>
          {({ width }) => <TreeCanvas root={annotated} width={width} />}
        </ParentSize>
      </div>
    </div>
  );
};
