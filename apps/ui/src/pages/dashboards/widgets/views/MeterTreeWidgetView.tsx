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
const NODE_H = 44;
/** Gaps between boxes, enough that the elbow links read as connections. */
const GAP_X = 56;
const GAP_Y = 12;
const PADDING = 12;
const MAX_LABEL = 20;

/** A share reads better as a percentage than a fraction. */
const asPercent = (ratio: number | null) =>
  ratio === null ? null : `${fmt(ratio * 100, 1)}%`;

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
        y={18}
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
        y={34}
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
        y={34}
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

  // Sized from the tree, not from the tile: a distribution board has as many
  // rows as it has circuits, and squeezing 70 of them into a widget's height
  // would leave every label unreadable. The container scrolls instead.
  const innerH = data.leaves().length * (NODE_H + GAP_Y);
  const innerW = (data.height + 1) * (NODE_W + GAP_X);

  return (
    <svg
      width={Math.max(innerW + PADDING * 2, width)}
      height={innerH + PADDING * 2}
    >
      <Group top={PADDING} left={PADDING}>
        <Tree<MeterTreeDatum> root={data} size={[innerH, innerW - NODE_W]}>
          {(tree) => (
            <Group>
              {tree.links().map((link) => (
                <path
                  key={`${link.source.data.key}->${link.target.data.key}`}
                  d={elbow(link.source, link.target)}
                  className="stroke-border"
                  strokeWidth={1}
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
          )}
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
      {/*
        The tree centres each parent over its children, so the root — the one
        figure the whole diagram is measured against — ends up halfway down a
        canvas taller than the tile and scrolls out of sight. Pinning it here
        keeps the building total on screen wherever the diagram is scrolled.
      */}
      <div className="flex shrink-0 items-baseline gap-3 border-b border-border px-3 py-2">
        <span className="truncate text-sm font-medium">{annotated.label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {annotated.total === null
            ? t("widgets.meterTree.noReading")
            : fmt(annotated.total, 0)}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <ParentSize>
          {({ width }) => <TreeCanvas root={annotated} width={width} />}
        </ParentSize>
      </div>
    </div>
  );
};
