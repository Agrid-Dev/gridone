/**
 * Pure assembly of the breadcrumb trail.
 *
 * The trail is route-driven: each page/layout registers the crumbs it owns
 * (with the entity data it already fetched) via `useBreadcrumb`. This module
 * only merges those registrations with the current pathname — it holds no
 * route knowledge beyond the flat top-level section labels, which the list
 * pages would otherwise all have to register identically.
 */

export type BreadcrumbCrumb = {
  /** Absolute path this crumb points to; also its identity and sort key. */
  to: string;
  /** Literal label (e.g. an entity name the page already has). */
  label?: string;
  /** i18next key, used when no literal label is supplied. */
  labelKey?: string;
};

export type TrailCrumb = BreadcrumbCrumb & { isCurrent: boolean };

/** Top-level section roots, derived from the pathname so the ~9 list pages
 *  don't each register the same crumb. Anything deeper is route-registered. */
export const SECTION_LABELS: Record<string, string> = {
  dashboards: "app.dashboards",
  devices: "app.devices",
  assets: "app.assets",
  drivers: "app.drivers",
  transports: "app.networks",
  automations: "app.automations",
  faults: "app.faults",
  users: "app.users",
  notifications: "app.notifications",
  settings: "breadcrumb.settings",
  apps: "app.apps",
};

/** Shared ancestor crumbs for sibling routes that have no mounted layout to
 *  supply them (e.g. `/devices/commands/new` must name its `Commands`
 *  ancestor itself). Section roots are derived, so they're not listed here. */
export const COMMANDS_CRUMB: BreadcrumbCrumb = {
  to: "/devices/commands",
  labelKey: "breadcrumb.commands",
};
export const TEMPLATES_CRUMB: BreadcrumbCrumb = {
  to: "/devices/commands/templates",
  labelKey: "breadcrumb.templates",
};

function segmentDepth(to: string): number {
  return to.split("/").filter(Boolean).length;
}

/** True when `to` is the current path or one of its ancestors (segment-aligned,
 *  so `/assets` matches `/assets/a1` but not `/assets-archive`). */
function isAncestorOrSelf(to: string, pathname: string): boolean {
  if (to === pathname) return true;
  const base = to.endsWith("/") ? to : `${to}/`;
  return pathname.startsWith(base);
}

/**
 * Merge the registered crumbs (from every mounted page/layout) with the
 * derived section root, keep only those on the current path, order them by
 * depth, and mark the deepest as current.
 */
export function buildTrail(
  pathname: string,
  registered: BreadcrumbCrumb[],
): TrailCrumb[] {
  const byTo = new Map<string, BreadcrumbCrumb>();

  const section = pathname.split("/").filter(Boolean)[0];
  if (section && SECTION_LABELS[section]) {
    byTo.set(`/${section}`, {
      to: `/${section}`,
      labelKey: SECTION_LABELS[section],
    });
  }

  for (const crumb of registered) {
    if (isAncestorOrSelf(crumb.to, pathname)) byTo.set(crumb.to, crumb);
  }

  const ordered = [...byTo.values()].sort(
    (a, b) =>
      segmentDepth(a.to) - segmentDepth(b.to) || a.to.length - b.to.length,
  );

  return ordered.map((crumb, i) => ({
    ...crumb,
    isCurrent: i === ordered.length - 1,
  }));
}
