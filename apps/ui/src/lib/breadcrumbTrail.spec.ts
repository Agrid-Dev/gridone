import { describe, it, expect } from "vitest";
import { buildTrail, type BreadcrumbCrumb } from "./breadcrumbTrail";

describe("buildTrail", () => {
  it("returns an empty trail on the home route", () => {
    expect(buildTrail("/", [])).toEqual([]);
  });

  it("derives the top-level section root from the pathname", () => {
    expect(buildTrail("/devices", [])).toEqual([
      { to: "/devices", labelKey: "app.devices", isCurrent: true },
    ]);
  });

  it("appends registered crumbs after the derived section, current last", () => {
    const registered: BreadcrumbCrumb[] = [
      { to: "/devices/dev-1", label: "RTU-3" },
    ];
    expect(buildTrail("/devices/dev-1", registered)).toEqual([
      { to: "/devices", labelKey: "app.devices", isCurrent: false },
      { to: "/devices/dev-1", label: "RTU-3", isCurrent: true },
    ]);
  });

  it("orders crumbs by path depth regardless of registration order", () => {
    const registered: BreadcrumbCrumb[] = [
      { to: "/devices/dev-1/history", labelKey: "breadcrumb.history" },
      { to: "/devices/dev-1", label: "RTU-3" },
    ];
    const trail = buildTrail("/devices/dev-1/history", registered);
    expect(trail.map((c) => c.to)).toEqual([
      "/devices",
      "/devices/dev-1",
      "/devices/dev-1/history",
    ]);
  });

  it("ignores registered crumbs that are not on the current path", () => {
    const registered: BreadcrumbCrumb[] = [
      { to: "/assets/a1", label: "Floor 1" },
      { to: "/devices/dev-1", label: "RTU-3" },
    ];
    const trail = buildTrail("/devices/dev-1", registered);
    expect(trail.map((c) => c.to)).toEqual(["/devices", "/devices/dev-1"]);
  });

  it("matches ancestors on segment boundaries only", () => {
    // `/assets` must not be treated as an ancestor of `/assets-archive`.
    const trail = buildTrail("/assets-archive", [
      { to: "/assets", labelKey: "app.assets" },
    ]);
    expect(trail).toEqual([]);
  });

  it("lets a registered crumb override the derived section label", () => {
    const trail = buildTrail("/automations/a1", [
      { to: "/automations/a1", label: "Night setback" },
    ]);
    expect(trail).toEqual([
      { to: "/automations", labelKey: "app.automations", isCurrent: false },
      { to: "/automations/a1", label: "Night setback", isCurrent: true },
    ]);
  });
});
