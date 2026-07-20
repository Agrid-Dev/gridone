import { describe, expect, it, vi } from "vitest";

import type { RequestFn } from "../http/httpClient";
import type {
  DashboardCreate,
  DashboardPatch,
  LayoutItem,
  WidgetCreateBody,
  WidgetUpdateBody,
} from "../types";
import { DashboardsResource } from "./dashboards";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    dashboards: new DashboardsResource(request as unknown as RequestFn),
    request,
  };
}

const CREATE: DashboardCreate = { name: "Ops", description: "Overview" };
const PATCH: DashboardPatch = { name: "Ops v2" };
const WIDGET: WidgetCreateBody = {
  config: { type: "text", text: "hi", color: "#1a2b3c" },
  title: "Note",
};
const WIDGET_PATCH: WidgetUpdateBody = { title: "Renamed" };
const LAYOUT: LayoutItem[] = [{ i: "w1", x: 0, y: 0, w: 4, h: 2 }];

type Case = [
  string,
  (dashboards: DashboardsResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  ["list", (d) => d.list(), ["GET", "/dashboards/"]],
  ["get", (d) => d.get("d1"), ["GET", "/dashboards/d1"]],
  [
    "create",
    (d) => d.create(CREATE),
    ["POST", "/dashboards/", { body: CREATE }],
  ],
  [
    "update",
    (d) => d.update("d1", PATCH),
    ["PUT", "/dashboards/d1", { body: PATCH }],
  ],
  ["delete", (d) => d.delete("d1"), ["DELETE", "/dashboards/d1"]],
  [
    "addWidget",
    (d) => d.addWidget("d1", WIDGET),
    ["POST", "/dashboards/d1/widgets", { body: WIDGET }],
  ],
  [
    "updateWidget",
    (d) => d.updateWidget("d1", "w1", WIDGET_PATCH),
    ["PUT", "/dashboards/d1/widgets/w1", { body: WIDGET_PATCH }],
  ],
  [
    "removeWidget",
    (d) => d.removeWidget("d1", "w1"),
    ["DELETE", "/dashboards/d1/widgets/w1"],
  ],
  [
    "updateLayout",
    (d) => d.updateLayout("d1", LAYOUT),
    ["PUT", "/dashboards/d1/layout", { body: LAYOUT }],
  ],
  [
    "getWidgetSchemas",
    (d) => d.getWidgetSchemas(),
    ["GET", "/dashboards/widget-schemas"],
  ],
];

describe("DashboardsResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { dashboards, request } = makeResource();

      await expect(invoke(dashboards)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );

  it("URL-encodes path parameters", async () => {
    const { dashboards, request } = makeResource();

    await dashboards.get("a/b?c");

    expect(request).toHaveBeenCalledExactlyOnceWith(
      "GET",
      "/dashboards/a%2Fb%3Fc",
    );
  });
});
