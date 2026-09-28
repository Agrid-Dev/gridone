import { memo, useCallback, useMemo, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Droplet, Zap, type LucideIcon } from "lucide-react";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import type { MeterMedium, MeterTreeWidgetConfig } from "@gridone/sdk";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/formatValue";
import { useDashboardPeriod } from "../../useDashboardPeriod";
import {
  buildMeterTreeHierarchy,
  defaultCollapsed,
  nodeAtKey,
  type CollapsedNodes,
  type MeterTreeDatum,
} from "./meterTree";
import { MeterNodeDialog } from "./MeterNodeDialog";
import { useMeterNodeLabel } from "./useMeterNodeLabel";
import { useMeterTreeAttributes } from "./useMeterTreeAttributes";
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
/** Medium edges rest this soft, so the focused path can be drawn stronger. */
const EDGE_SOFT = 0.6;
/** The focused path on a tree without a medium, whose edges are already faint. */
const NEUTRAL_FOCUS = "stroke-muted-foreground";
/** Space between a box and its focus ring, so a fault's red border stays visible. */
const FOCUS_GAP = 2.5;
/** Width of the accent bar on the left of a meter's box. */
const ACCENT_W = 3;
const ICON_SIZE = 14;

type MediumPalette = {
  stroke: string;
  fill: string;
  /** The root's background, so the figure everything is a share of stands out. */
  tint: string;
  icon: LucideIcon;
};

/** What each medium is drawn with. Literal classes so Tailwind keeps them. */
const MEDIUM_PALETTE: Record<MeterMedium, MediumPalette> = {
  electricity: {
    stroke: "stroke-meter-electricity",
    fill: "fill-meter-electricity",
    tint: "fill-meter-electricity/10",
    icon: Zap,
  },
  water: {
    stroke: "stroke-meter-water",
    fill: "fill-meter-water",
    tint: "fill-meter-water/10",
    icon: Droplet,
  },
};

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

/**
 * The palette for a tree's medium, or `null` for the neutral look: a tree
 * without a medium, or with one this bundle predates, keeps the plain drawing.
 */
function mediumPalette(medium: MeterMedium | null | undefined) {
  if (!medium) return null;
  const palette = MEDIUM_PALETTE[medium];
  if (!palette && import.meta.env.DEV) {
    console.warn(`Unknown meter medium "${medium}", drawn neutral`);
  }
  return palette ?? null;
}

type TreeEdge = {
  /** The node the edge feeds: one edge per node, so it also keys the edge. */
  target: string;
  d: string;
  width: number;
  residual: boolean;
};

/**
 * Where every node and edge sits. Computed once per tree, so focusing a path
 * redraws the path, not the layout.
 *
 * One row per node, in reading order, rather than the layout's default of
 * centring each parent over its children: centring buries the root halfway
 * down a canvas taller than the tile, and the root is the figure everything
 * else is a share of. Sized from the tree, not the tile — a board has as many
 * rows as it has circuits — so the container scrolls instead of shrinking
 * every label past legibility.
 */
function layoutTree(root: MeterTreeDatum) {
  const data = hierarchy<MeterTreeDatum>(root);
  const innerH = data.descendants().length * ROW;
  const innerW = (data.height + 1) * (NODE_W + GAP_X);
  const laid = tree<MeterTreeDatum>().size([innerH, innerW - NODE_W])(data);
  // `eachBefore` is depth-first, parents before children — the order the rows
  // are read in. Reassigning `x` keeps the layout responsible for the
  // horizontal placement and the link topology.
  let row = 0;
  laid.eachBefore((node) => {
    node.x = row * ROW + NODE_H / 2;
    row += 1;
  });
  const edges: TreeEdge[] = laid.links().map((link) => ({
    target: link.target.data.key,
    d: elbow(link.source, link.target),
    width: edgeWidth(link.target.data.shareOfTotal),
    residual: link.target.data.kind === "residual",
  }));
  const nodes = laid.descendants();
  const byKey = new Map(nodes.map((node) => [node.data.key, node]));
  return { nodes, byKey, edges, innerW, innerH };
}

function edgePath(edge: TreeEdge, stroke: string, dotResidual: boolean) {
  const dotted = dotResidual && edge.residual;
  return (
    <path
      key={edge.target}
      d={edge.d}
      className={stroke}
      strokeWidth={edge.width}
      // Dotted: what is left over is computed, not metered.
      strokeDasharray={dotted ? `1 ${edge.width + 3}` : undefined}
      strokeLinecap={dotted ? "round" : undefined}
      strokeLinejoin="round"
      fill="none"
    />
  );
}

/** Whether a node's number is a fault rather than just a small figure. */
function isFaulty(datum: MeterTreeDatum): boolean {
  return datum.kind === "residual"
    ? (datum.negative ?? false)
    : datum.state === "reset";
}

/**
 * Whether the figure is an upper bound rather than a measurement.
 *
 * A residual subtracts the children from the feeder, so a child with no reading
 * contributes nothing to the subtraction and the remainder comes out too high.
 * The true unmetered amount is at most what is shown — which is a different
 * thing from a fault, and drawn differently: dashed, not red.
 */
function isBounded(datum: MeterTreeDatum): boolean {
  return datum.kind === "residual" && (datum.incomplete ?? false);
}

type NodeBoxProps = {
  node: HierarchyPointNode<MeterTreeDatum>;
  palette: MediumPalette | null;
  label: string;
  noReading: string;
  incompleteMark: string;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
  onHover: (key: string) => void;
  onKeyboardFocus: (key: string | null) => void;
};

/** Memoised: none of its props change while a path is focused, so hovering
 *  across a large board redraws the path and rings, not every box. */
const NodeBox = memo(function NodeBox({
  node,
  palette,
  label,
  noReading,
  incompleteMark,
  onToggle,
  onSelect,
  onHover,
  onKeyboardFocus,
}: NodeBoxProps) {
  const datum = node.data;
  const residual = datum.kind === "residual";
  const root = node.depth === 0;
  const faulty = isFaulty(datum);
  const bounded = isBounded(datum);
  // A folded node keeps its children in the config but not in the layout, so
  // `node.children` cannot answer this — the datum's own flag can.
  const foldable = datum.kind === "meter" && (datum.collapsed || node.children);

  return (
    <Group
      top={node.x - NODE_H / 2}
      left={node.y}
      style={foldable ? { cursor: "pointer" } : undefined}
      onClick={foldable ? () => onToggle(datum.key) : undefined}
      // Mouse only: a tap would leave the path focused with nothing to clear
      // it. Leaving a box does not clear it either; leaving the tree does, so
      // crossing the gap to the next row does not blink.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover(datum.key);
      }}
      // A node's name is a button, so tabbing to it traces its path too; nodes
      // without a device have no name to tab to. Focus a tap or a closing
      // dialog puts back is not the keyboard's, and would stay lit.
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) onKeyboardFocus(datum.key);
      }}
      onBlur={() => onKeyboardFocus(null)}
      data-node={datum.key}
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={6}
        strokeWidth={1}
        // Dashed reads as provisional, and composes with the fault colour: a
        // residual can be both overstated and negative, and both facts matter.
        strokeDasharray={bounded ? "4 3" : undefined}
        className={
          faulty
            ? "fill-destructive/10 stroke-destructive"
            : bounded
              ? "fill-muted stroke-muted-foreground"
              : residual
                ? "fill-muted stroke-border"
                : root && palette
                  ? `${palette.tint} stroke-border`
                  : "fill-card stroke-border"
        }
      />
      {palette && !residual ? (
        <rect
          x={1}
          y={6}
          width={ACCENT_W}
          height={NODE_H - 12}
          rx={ACCENT_W / 2}
          className={palette.fill}
          data-accent
        />
      ) : null}
      {palette && root ? (
        <palette.icon
          x={NODE_W - ICON_SIZE - 8}
          y={NODE_H - ICON_SIZE - 6}
          size={ICON_SIZE}
          className={palette.stroke}
        />
      ) : null}
      {datum.deviceId ? (
        <foreignObject x={10} y={2} width={NODE_W - 20} height={18}>
          <button
            type="button"
            onClick={(event) => {
              // The box itself folds; the name opens the node's details.
              event.stopPropagation();
              onSelect(datum.key);
            }}
            className="block w-full truncate text-left text-[11px] font-medium text-primary hover:underline focus-visible:underline"
          >
            {label}
          </button>
        </foreignObject>
      ) : (
        <text
          x={10}
          y={15}
          className={
            residual
              ? "fill-muted-foreground text-[11px] italic"
              : "fill-foreground text-[11px] font-medium"
          }
        >
          {label.length > MAX_LABEL
            ? `${label.slice(0, MAX_LABEL - 1)}…`
            : label}
        </text>
      )}
      <text
        x={10}
        y={30}
        className={
          faulty
            ? "fill-destructive text-[12px] font-semibold tabular-nums"
            : root && palette
              ? "fill-foreground text-[12px] font-semibold tabular-nums"
              : "fill-foreground text-[12px] tabular-nums"
        }
      >
        {datum.total === null ? (
          noReading
        ) : (
          <>
            {`${bounded ? "≤ " : ""}${fmt(datum.total, 0)}`}
            {datum.unit && (
              <tspan className="fill-muted-foreground text-[11px]">
                {` ${datum.unit}`}
              </tspan>
            )}
          </>
        )}
      </text>
      <text
        x={NODE_W - 10}
        y={30}
        textAnchor="end"
        className="fill-muted-foreground text-[11px] tabular-nums"
      >
        {asPercent(datum.ratioOfParent) ?? ""}
      </text>
      {foldable && (
        // Out in the gutter rather than inside the box: at the box's right edge
        // it sat on top of the percentage, which is right-aligned there. Here it
        // lands on the horizontal run of the outgoing elbow, before the corner
        // at GAP_X / 2 — so it reads as a junction on the feeder it opens.
        <g
          transform={`translate(${NODE_W + 12}, ${NODE_H / 2})`}
          className="fill-muted stroke-border"
        >
          <circle
            r={7}
            strokeWidth={1}
            // On the run out to the children, so it takes their colour.
            className={palette?.stroke}
          />
          <path
            d={datum.collapsed ? "M-3,0 H3 M0,-3 V3" : "M-3,0 H3"}
            className="stroke-muted-foreground"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </g>
      )}
      {bounded && <title>{incompleteMark}</title>}
    </Group>
  );
});

const TreeCanvas: FC<{
  root: MeterTreeDatum;
  medium: MeterMedium | null | undefined;
  width: number;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
}> = ({ root, medium, width, onToggle, onSelect }) => {
  const { t } = useTranslation("dashboards");
  const labelOf = useMeterNodeLabel();
  const palette = mediumPalette(medium);
  const focusStroke = palette?.stroke ?? NEUTRAL_FOCUS;
  const layout = useMemo(() => layoutTree(root), [root]);
  // Kept apart so neither clears the other; the mouse wins while on the tree.
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const active = hovered ?? focused;
  const path = new Set(
    (active === null ? undefined : layout.byKey.get(active))
      ?.ancestors()
      .map((node) => node.data.key),
  );
  const dotResidual = palette !== null;
  const noReading = t("widgets.meterTree.noReading");
  const incompleteMark = t("widgets.meterTree.incomplete");
  // One group, softened once: siblings overlap on their parent's run, and
  // translucent edges drawn over each other would stack back to full strength.
  const resting = useMemo(
    () => (
      <g opacity={palette ? EDGE_SOFT : undefined}>
        {layout.edges.map((edge) =>
          edgePath(edge, palette?.stroke ?? "stroke-border", dotResidual),
        )}
      </g>
    ),
    [layout, palette, dotResidual],
  );

  return (
    <svg
      width={Math.max(layout.innerW + PADDING * 2, width)}
      height={layout.innerH + PADDING * 2}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(null);
      }}
    >
      <Group top={PADDING} left={PADDING}>
        {resting}
        {/* The focused path again, over the rest at full strength: nothing
            else changes, so focusing does not make the tree blink. Under the
            boxes, so it does not cover their fold buttons. */}
        <g data-focus-path>
          {layout.edges
            .filter((edge) => path.has(edge.target))
            .map((edge) => edgePath(edge, focusStroke, dotResidual))}
        </g>
        {layout.nodes.map((node) => (
          <NodeBox
            key={node.data.key}
            node={node}
            palette={palette}
            label={labelOf(node.data)}
            noReading={noReading}
            incompleteMark={incompleteMark}
            onToggle={onToggle}
            onSelect={onSelect}
            onHover={setHovered}
            onKeyboardFocus={setFocused}
          />
        ))}
        {layout.nodes
          .filter((node) => path.has(node.data.key))
          .map((node) => (
            <rect
              key={node.data.key}
              x={node.y - FOCUS_GAP}
              y={node.x - NODE_H / 2 - FOCUS_GAP}
              width={NODE_W + FOCUS_GAP * 2}
              height={NODE_H + FOCUS_GAP * 2}
              rx={6 + FOCUS_GAP}
              fill="none"
              strokeWidth={1.5}
              className={focusStroke}
              pointerEvents="none"
              data-focus-ring={node.data.key}
            />
          ))}
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
  const { root, medium } = config as MeterTreeWidgetConfig;
  const period = useDashboardPeriod();
  // Per-viewer, and deliberately not in the widget config: which branches
  // someone has open while reading a tree is not a property of the tree.
  const [collapsed, setCollapsed] = useState<CollapsedNodes>(() =>
    root ? defaultCollapsed(root) : new Set<string>(),
  );
  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);
  const [selected, setSelected] = useState<string | null>(null);
  const attributes = useMeterTreeAttributes(root, collapsed);
  const { values, loading } = useMeterTreeValues(
    root,
    { ...period.query, refetchInterval: period.refetchInterval },
    collapsed,
  );

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

  const annotated = buildMeterTreeHierarchy(
    root,
    values,
    collapsed,
    attributes,
  );
  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <ParentSize>
          {({ width }) => (
            <TreeCanvas
              root={annotated}
              medium={medium}
              width={width}
              onToggle={toggle}
              onSelect={setSelected}
            />
          )}
        </ParentSize>
      </div>
      <MeterNodeDialog
        node={selected === null ? undefined : nodeAtKey(root, selected)}
        onClose={() => setSelected(null)}
      />
    </div>
  );
};
