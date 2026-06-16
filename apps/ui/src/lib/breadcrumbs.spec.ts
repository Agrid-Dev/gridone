import { describe, it, expect } from "vitest";
import { pathnameToSegments } from "./breadcrumbs";

describe("pathnameToSegments", () => {
  it("returns an empty trail for the home route (root only)", () => {
    expect(pathnameToSegments("/")).toEqual([]);
    expect(pathnameToSegments("")).toEqual([]);
  });

  it("marks only the last segment as current", () => {
    const segments = pathnameToSegments("/devices/dev-1/edit");
    expect(segments.map((s) => s.isCurrent)).toEqual([false, false, true]);
  });

  it("builds the devices list crumb", () => {
    const segments = pathnameToSegments("/devices");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      labelKey: "app.devices",
      href: "/devices",
      isCurrent: true,
    });
  });

  it("resolves a device id as an entity segment", () => {
    const segments = pathnameToSegments("/devices/dev-1");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ labelKey: "app.devices", isCurrent: false }); // prettier-ignore
    expect(segments[1]).toMatchObject({
      entity: { kind: "device", id: "dev-1" },
      href: "/devices/dev-1",
      isCurrent: true,
    });
  });

  it("renders a complete trail for a device history view (leaf is current)", () => {
    const segments = pathnameToSegments("/devices/dev-1/history/table");
    expect(segments.map((s) => s.labelKey ?? s.entity?.kind)).toEqual([
      "app.devices",
      "device",
      "breadcrumb.history",
    ]);
    expect(segments.at(-1)).toMatchObject({ labelKey: "breadcrumb.history", isCurrent: true }); // prettier-ignore
  });

  it("renders a trail for new command under a device", () => {
    const segments = pathnameToSegments("/devices/dev-1/commands/new");
    expect(segments.map((s) => s.labelKey ?? s.entity?.kind)).toEqual([
      "app.devices",
      "device",
      "breadcrumb.newCommand",
    ]);
  });

  it("builds the commands list trail", () => {
    const segments = pathnameToSegments("/devices/commands");
    expect(segments.map((s) => s.labelKey)).toEqual([
      "app.devices",
      "breadcrumb.commands",
    ]);
    expect(segments.at(-1)?.isCurrent).toBe(true);
  });

  it("builds a template detail trail with the templates ancestor linked", () => {
    const segments = pathnameToSegments("/devices/commands/templates/tpl-1");
    expect(segments.map((s) => s.labelKey ?? s.entity?.kind)).toEqual([
      "app.devices",
      "breadcrumb.commands",
      "breadcrumb.templates",
      "template",
    ]);
    expect(segments.at(-1)).toMatchObject({
      entity: { kind: "template", id: "tpl-1" },
      isCurrent: true,
    });
    // every ancestor is a link (has an href and is not current)
    expect(segments.slice(0, -1).every((s) => s.href && !s.isCurrent)).toBe(
      true,
    );
  });

  it("labels assets as Zones and resolves the asset id as an entity", () => {
    const segments = pathnameToSegments("/assets/asset-1");
    expect(segments[0]).toMatchObject({ labelKey: "app.assets", href: "/assets" }); // prettier-ignore
    expect(segments[1]).toMatchObject({
      entity: { kind: "asset", id: "asset-1" },
      isCurrent: true,
    });
  });

  it("renders the driver id literally (drivers have no name)", () => {
    const segments = pathnameToSegments("/drivers/acme.rtu");
    expect(segments[0]).toMatchObject({ labelKey: "app.drivers" });
    expect(segments[1]).toMatchObject({
      rawLabel: "acme.rtu",
      href: "/drivers/acme.rtu",
      isCurrent: true,
    });
  });

  it("builds single-segment trails for flat sections", () => {
    expect(pathnameToSegments("/faults")).toEqual([
      {
        key: "faults",
        labelKey: "app.faults",
        href: "/faults",
        isCurrent: true,
      },
    ]);
    expect(pathnameToSegments("/settings")).toEqual([
      { key: "settings", labelKey: "breadcrumb.settings", href: "/settings", isCurrent: true }, // prettier-ignore
    ]);
  });

  it("returns an empty trail for unknown sections", () => {
    expect(pathnameToSegments("/wat/ever")).toEqual([]);
  });
});
