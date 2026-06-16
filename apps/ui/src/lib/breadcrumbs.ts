/**
 * Pure derivation of breadcrumb segments from a URL pathname.
 *
 * Routing is decentralized (per-module nested `<Routes>`), and the breadcrumb
 * lives in the top bar — a sibling of `<Routes>` that cannot read nested route
 * params. So the trail is derived from `location.pathname` here instead.
 *
 * This returns only the segments *after* the building root; the root (building
 * identity → `/`) is always rendered by `<Breadcrumbs>`. On `/` it returns an
 * empty trail (root only). The last segment is always `isCurrent`.
 *
 * Segments carry one of three label sources, resolved by the renderer:
 *  - `labelKey`  → translated via i18next (static labels).
 *  - `entity`    → display name looked up from the React Query cache by id,
 *                  falling back to the id while it loads.
 *  - `rawLabel`  → literal text already known from the path (e.g. an id used
 *                  as the display value, like a driver id).
 */

export type BreadcrumbEntityKind = "device" | "asset" | "template";

export type BreadcrumbSegment = {
  /** Stable React key. */
  key: string;
  /** i18next key for a static label. */
  labelKey?: string;
  /** Entity whose display name is resolved from the query cache. */
  entity?: { kind: BreadcrumbEntityKind; id: string };
  /** Literal label already known from the path. */
  rawLabel?: string;
  /** Navigation target for ancestor (link) segments. */
  href: string;
  /** The current (last) segment — rendered non-link. */
  isCurrent: boolean;
};

type Crumb = Omit<BreadcrumbSegment, "isCurrent">;

/** Build a trail, stamping the last entry as the current (non-link) segment. */
function trail(crumbs: Crumb[]): BreadcrumbSegment[] {
  return crumbs.map((crumb, i) => ({
    ...crumb,
    isCurrent: i === crumbs.length - 1,
  }));
}

const DEVICES: Crumb = { key: "devices", labelKey: "app.devices", href: "/devices" }; // prettier-ignore
const ZONES: Crumb = { key: "zones", labelKey: "app.assets", href: "/assets" };
const DRIVERS: Crumb = { key: "drivers", labelKey: "app.drivers", href: "/drivers" }; // prettier-ignore

export function pathnameToSegments(pathname: string): BreadcrumbSegment[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [];

  const [section, ...rest] = parts;

  switch (section) {
    case "devices":
      return devicesTrail(rest);
    case "assets":
      return assetsTrail(rest);
    case "drivers":
      return driversTrail(rest);
    case "automations":
      return sectionTrail("automations", "app.automations", rest);
    case "faults":
      return trail([
        { key: "faults", labelKey: "app.faults", href: "/faults" },
      ]);
    case "users":
      return trail([{ key: "users", labelKey: "app.users", href: "/users" }]);
    case "notifications":
      return trail([
        { key: "notifications", labelKey: "app.notifications", href: "/notifications" }, // prettier-ignore
      ]);
    case "settings":
      return trail([
        { key: "settings", labelKey: "breadcrumb.settings", href: "/settings" },
      ]);
    default:
      return [];
  }
}

function devicesTrail(rest: string[]): BreadcrumbSegment[] {
  if (rest.length === 0) return trail([DEVICES]);

  const [first, ...tail] = rest;

  // Reserved keywords at the /devices level (not device ids).
  if (first === "new") {
    return trail([DEVICES, { key: "new", labelKey: "breadcrumb.new", href: "/devices/new" }]); // prettier-ignore
  }
  if (first === "history") {
    // Legacy redirect to /devices/commands — show just the root section.
    return trail([DEVICES]);
  }
  if (first === "commands") {
    return commandsTrail(tail);
  }

  // /devices/:deviceId[/...]
  const deviceId = first;
  const device: Crumb = {
    key: `device-${deviceId}`,
    entity: { kind: "device", id: deviceId },
    href: `/devices/${deviceId}`,
  };
  if (tail.length === 0) return trail([DEVICES, device]);

  if (tail[0] === "edit") {
    return trail([DEVICES, device, { key: "edit", labelKey: "breadcrumb.edit", href: `/devices/${deviceId}/edit` }]); // prettier-ignore
  }
  if (tail[0] === "history") {
    return trail([DEVICES, device, { key: "history", labelKey: "breadcrumb.history", href: `/devices/${deviceId}/history` }]); // prettier-ignore
  }
  if (tail[0] === "commands" && tail[1] === "new") {
    return trail([DEVICES, device, { key: "command-new", labelKey: "breadcrumb.newCommand", href: `/devices/${deviceId}/commands/new` }]); // prettier-ignore
  }
  return trail([DEVICES, device]);
}

function commandsTrail(rest: string[]): BreadcrumbSegment[] {
  const commands: Crumb = { key: "commands", labelKey: "breadcrumb.commands", href: "/devices/commands" }; // prettier-ignore
  if (rest.length === 0) return trail([DEVICES, commands]);

  if (rest[0] === "new") {
    return trail([DEVICES, commands, { key: "command-new", labelKey: "breadcrumb.newCommand", href: "/devices/commands/new" }]); // prettier-ignore
  }
  if (rest[0] === "templates") {
    const templates: Crumb = { key: "templates", labelKey: "breadcrumb.templates", href: "/devices/commands/templates" }; // prettier-ignore
    const templateId = rest[1];
    if (!templateId) return trail([DEVICES, commands, templates]);
    return trail([
      DEVICES,
      commands,
      templates,
      {
        key: `template-${templateId}`,
        entity: { kind: "template", id: templateId },
        href: `/devices/commands/templates/${templateId}`,
      },
    ]);
  }
  return trail([DEVICES, commands]);
}

function assetsTrail(rest: string[]): BreadcrumbSegment[] {
  if (rest.length === 0) return trail([ZONES]);

  const [first, ...tail] = rest;
  if (first === "new") {
    return trail([ZONES, { key: "new", labelKey: "breadcrumb.new", href: "/assets/new" }]); // prettier-ignore
  }

  const assetId = first;
  const asset: Crumb = {
    key: `asset-${assetId}`,
    entity: { kind: "asset", id: assetId },
    href: `/assets/${assetId}`,
  };
  if (tail.length === 0) return trail([ZONES, asset]);

  if (tail[0] === "edit") {
    return trail([ZONES, asset, { key: "edit", labelKey: "breadcrumb.edit", href: `/assets/${assetId}/edit` }]); // prettier-ignore
  }
  if (tail[0] === "commands" && tail[1] === "new") {
    return trail([ZONES, asset, { key: "command-new", labelKey: "breadcrumb.newCommand", href: `/assets/${assetId}/commands/new` }]); // prettier-ignore
  }
  return trail([ZONES, asset]);
}

function driversTrail(rest: string[]): BreadcrumbSegment[] {
  if (rest.length === 0) return trail([DRIVERS]);
  if (rest[0] === "new") {
    return trail([DRIVERS, { key: "new", labelKey: "breadcrumb.new", href: "/drivers/new" }]); // prettier-ignore
  }
  // Drivers are titled by their id (no name field).
  const driverId = rest[0];
  return trail([
    DRIVERS,
    { key: `driver-${driverId}`, rawLabel: driverId, href: `/drivers/${driverId}` }, // prettier-ignore
  ]);
}

/** Generic `/{section}` and `/{section}/{new|id}` trail. */
function sectionTrail(
  section: string,
  labelKey: string,
  rest: string[],
): BreadcrumbSegment[] {
  const root: Crumb = { key: section, labelKey, href: `/${section}` };
  if (rest.length === 0) return trail([root]);
  if (rest[0] === "new") {
    return trail([root, { key: "new", labelKey: "breadcrumb.new", href: `/${section}/new` }]); // prettier-ignore
  }
  return trail([
    root,
    { key: `${section}-${rest[0]}`, rawLabel: rest[0], href: `/${section}/${rest[0]}` }, // prettier-ignore
  ]);
}
