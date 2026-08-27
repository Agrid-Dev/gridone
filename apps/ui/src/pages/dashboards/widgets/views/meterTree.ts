import type { MeterTreeNode } from "@gridone/sdk";

/** A node's meter reference, taken straight off the node so the SDK need
 *  not export the target type separately. */
type MeterTarget = MeterTreeNode["meter"];

/**
 * Consumption of one meter over the dashboard period, or `null` when it has
 * none — a counter that was never written, or written only once.
 *
 * Keyed by {@link meterKey}, so two nodes pointing at the same meter share a
 * single reading (and, upstream, a single request).
 */
export type MeterValues = ReadonlyMap<string, number | null>;

/** Why a meter row shows the total it shows. */
export type MeterRowState =
  /** A meter with a reading. */
  | "ok"
  /** Declares a meter, but it has no reading. Children still total up. */
  | "unknown"
  /** Declares no meter: the total is the sum of the children. */
  | "unmetered"
  /**
   * Negative consumption, which a counter cannot produce by running. The index
   * went backwards — a meter replaced, or one that rolled over. Distinct from a
   * negative residual, which is a metering *hierarchy* problem.
   */
  | "reset";

export type MeterTreeRow =
  | {
      kind: "meter";
      /** Stable identity for React, from the node's position in the tree. */
      key: string;
      label: string;
      /** 0 for the root; drives indentation. */
      depth: number;
      /** What this node contributes to its parent. */
      total: number | null;
      /** `total` over the parent's `total`; `null` when that cannot be divided by. */
      ratioOfParent: number | null;
      state: MeterRowState;
      /** Whether this node has children, so the view can render a twisty. */
      hasChildren: boolean;
    }
  | {
      kind: "residual";
      key: string;
      /** Depth of the children it sits among, so it lines up with them. */
      depth: number;
      /** Parent's reading minus the sum of its children. */
      total: number;
      ratioOfParent: number | null;
      /**
       * Children sum to more than the parent metered. Physically impossible, so
       * it means the hierarchy or the meters disagree — surfaced, never clamped.
       */
      negative: boolean;
      /**
       * At least one child has no reading, so the sum subtracted here is an
       * undercount and this residual is overstated. Without it a tree with dead
       * meters reads as "30% unmetered" when the truth is "we cannot tell".
       */
      incomplete: boolean;
    };

/**
 * Identity of the meter a node reads: its device and attribute.
 *
 * A node's target is constrained server-side to exactly one explicit device id,
 * so there is always at most one. Returns `null` for a node that declares no
 * meter, or whose target somehow carries no id.
 */
export function meterKey(meter: MeterTarget): string | null {
  const id = meter?.devices?.ids?.[0];
  if (!id || !meter) return null;
  // NUL cannot appear in either part, so the join is unambiguous.
  return `${id}\u0000${meter.attribute}`;
}

/** The device and attribute a {@link meterKey} was built from. */
export function parseMeterKey(key: string): {
  deviceId: string;
  attribute: string;
} {
  const separator = key.indexOf("\u0000");
  return {
    deviceId: key.slice(0, separator),
    attribute: key.slice(separator + 1),
  };
}

/**
 * Every distinct meter the tree reads, in walk order.
 *
 * Deduplicated: the fan-out is one request per meter, not per node, so a meter
 * referenced twice costs one query.
 */
export function collectMeterKeys(root: MeterTreeNode): string[] {
  const keys = new Set<string>();
  const visit = (node: MeterTreeNode) => {
    const key = meterKey(node.meter);
    if (key) keys.add(key);
    node.children?.forEach(visit);
  };
  visit(root);
  return [...keys];
}

/**
 * A ratio is only meaningful against a positive denominator.
 *
 * Zero would divide to infinity, and a negative parent is a counter reset whose
 * proportions mean nothing — the parent row already flags that. Returning
 * `null` leaves the view to say "unknown" rather than print a number that looks
 * authoritative and is not.
 */
function ratio(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return part / whole;
}

type Resolved = {
  total: number | null;
  state: MeterRowState;
  ownReading: number | null;
  childrenTotal: number | null;
  /**
   * Whether `total` is a complete figure rather than a sum that silently omits
   * meters with no reading.
   *
   * A metered node is exact whenever it has a reading — what happens below it
   * cannot change what its own meter measured. Only an unmetered node, which
   * *is* the sum of its children, inherits their incompleteness.
   */
  totalIsExact: boolean;
};

/**
 * Fold every node's own reading together with its children's, once.
 *
 * A node that declares a meter reports that meter, full stop — its children are
 * a breakdown of it, not an addition to it, and summing both would double-count.
 * Only an unmetered node stands in for its children.
 *
 * Resolved post-order into a map keyed by node identity, so each node is
 * visited once however deep the tree; resolving lazily per level would re-walk
 * every subtree from each of its ancestors.
 */
function resolveAll(
  root: MeterTreeNode,
  values: MeterValues,
): Map<MeterTreeNode, Resolved> {
  const resolved = new Map<MeterTreeNode, Resolved>();

  const visit = (node: MeterTreeNode): Resolved => {
    const key = meterKey(node.meter);
    const ownReading = key ? (values.get(key) ?? null) : null;
    const children = node.children ?? [];

    let childrenTotal: number | null = null;
    let childrenExact = true;
    if (children.length > 0) {
      let sum = 0;
      for (const child of children) {
        const childResolved = visit(child);
        if (childResolved.total === null || !childResolved.totalIsExact) {
          childrenExact = false;
        }
        if (childResolved.total !== null) sum += childResolved.total;
      }
      childrenTotal = sum;
    }

    const entry: Resolved =
      key === null
        ? {
            // Unmetered: it exists to group, so it stands in for what it groups.
            total: childrenTotal,
            state: "unmetered",
            ownReading: null,
            childrenTotal,
            totalIsExact: childrenTotal !== null && childrenExact,
          }
        : {
            total: ownReading,
            state:
              ownReading === null ? "unknown" : ownReading < 0 ? "reset" : "ok",
            ownReading,
            childrenTotal,
            totalIsExact: ownReading !== null,
          };
    resolved.set(node, entry);
    return entry;
  };

  visit(root);
  return resolved;
}

/** Whether every child contributes an exact figure to the sum below *node*. */
function childrenAreExact(
  node: MeterTreeNode,
  resolvedNodes: Map<MeterTreeNode, Resolved>,
): boolean {
  return (node.children ?? []).every((child) => {
    const resolved = resolvedNodes.get(child);
    return (
      resolved !== undefined && resolved.total !== null && resolved.totalIsExact
    );
  });
}

/**
 * A node as the view consumes it: the config's hierarchy annotated with what
 * each node consumed, plus a synthetic residual child where one applies.
 *
 * Kept nested rather than flat because a tree diagram needs the shape; the flat
 * rows a list view wants are derived from this by {@link buildMeterTreeRows},
 * so both come from one computation and cannot disagree.
 */
export type MeterTreeDatum = {
  key: string;
  label: string;
  kind: "meter" | "residual";
  /** What this node contributes to its parent. */
  total: number | null;
  /** `total` over the parent's `total`; `null` when that cannot be divided by. */
  ratioOfParent: number | null;
  /**
   * `total` over the whole tree's total.
   *
   * Strictly decreasing down the tree, unlike the share of a parent, so it is
   * what the diagram can safely give thickness to: a branch never out-draws the
   * trunk feeding it.
   */
  shareOfTotal: number | null;
  /** Meter nodes only. */
  state?: MeterRowState;
  /** Residual nodes only: children sum to more than the parent metered. */
  negative?: boolean;
  /** Residual nodes only: the sum subtracted is missing a meter. */
  incomplete?: boolean;
  children: MeterTreeDatum[];
};

/**
 * Annotate the configured tree with each node's consumption over the period.
 *
 * Shares are taken against the parent's own total, so children that out-measure
 * their parent visibly exceed 100% instead of being normalised into looking
 * consistent — a meter tree exists partly to expose that disagreement.
 *
 * A metered parent gains a residual child for what its own meter saw but its
 * children do not account for. An unmetered parent gains none: its total *is*
 * its children, so the residual would always be zero and say nothing.
 */
export function buildMeterTreeHierarchy(
  root: MeterTreeNode,
  values: MeterValues,
): MeterTreeDatum {
  const resolvedNodes = resolveAll(root, values);

  const rootTotal = resolvedNodes.get(root)?.total ?? null;

  const visit = (
    node: MeterTreeNode,
    key: string,
    parentTotal: number | null,
  ): MeterTreeDatum => {
    const resolved = resolvedNodes.get(node)!;
    const children = (node.children ?? []).map((child, index) =>
      visit(child, `${key}.${index}`, resolved.total),
    );

    if (
      children.length > 0 &&
      resolved.ownReading !== null &&
      resolved.childrenTotal !== null
    ) {
      const amount = resolved.ownReading - resolved.childrenTotal;
      children.push({
        key: `${key}.residual`,
        label: "",
        kind: "residual",
        total: amount,
        ratioOfParent: ratio(amount, resolved.ownReading),
        shareOfTotal: ratio(amount, rootTotal),
        negative: amount < 0,
        incomplete: !childrenAreExact(node, resolvedNodes),
        children: [],
      });
    }

    return {
      key,
      label: node.label,
      kind: "meter",
      total: resolved.total,
      ratioOfParent: ratio(resolved.total, parentTotal),
      shareOfTotal: ratio(resolved.total, rootTotal),
      state: resolved.state,
      children,
    };
  };

  return visit(root, "0", null);
}

/**
 * The same tree flattened into rows, depth-first, parents before children.
 *
 * Flat rather than nested so a list view is a single `map` and indentation is
 * just a number.
 */
export function buildMeterTreeRows(
  root: MeterTreeNode,
  values: MeterValues,
): MeterTreeRow[] {
  const rows: MeterTreeRow[] = [];

  const visit = (datum: MeterTreeDatum, depth: number) => {
    if (datum.kind === "residual") {
      rows.push({
        kind: "residual",
        key: datum.key,
        depth,
        total: datum.total as number,
        ratioOfParent: datum.ratioOfParent,
        negative: datum.negative ?? false,
        incomplete: datum.incomplete ?? false,
      });
      return;
    }
    rows.push({
      kind: "meter",
      key: datum.key,
      label: datum.label,
      depth,
      total: datum.total,
      ratioOfParent: datum.ratioOfParent,
      state: datum.state ?? "unknown",
      // The residual is synthetic, so it must not make a leaf look like a parent.
      hasChildren: datum.children.some((child) => child.kind === "meter"),
    });
    datum.children.forEach((child) => visit(child, depth + 1));
  };

  visit(buildMeterTreeHierarchy(root, values), 0);
  return rows;
}
