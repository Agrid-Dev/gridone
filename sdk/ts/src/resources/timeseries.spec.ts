import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { operations } from "../generated/openapi";
import type { RequestFn } from "../http/httpClient";
import type {
  TimeseriesBulkPushRequest,
  TimeseriesSingleAttrPushRequest,
} from "../types";
import type { TimeseriesExportParams } from "./timeseries";
import { TimeseriesResource } from "./timeseries";

const RESULT = { wire: true };

function makeResource() {
  const request = vi.fn(async () => RESULT);
  return {
    timeseries: new TimeseriesResource(request as unknown as RequestFn),
    request,
  };
}

const BULK_PUSH: TimeseriesBulkPushRequest = {
  data: [
    {
      attribute: "active_power",
      value: 1200,
      timestamp: "2026-07-07T00:00:00Z",
    },
  ],
};
const ATTR_PUSH: TimeseriesSingleAttrPushRequest = {
  data: [{ value: 1200, timestamp: "2026-07-07T00:00:00Z" }],
};
const EXPORT_PARAMS = { series_ids: ["s1", "s2"], last: "24h" };

type Case = [
  string,
  (timeseries: TimeseriesResource) => Promise<unknown>,
  Parameters<RequestFn>,
];

const CASES: Case[] = [
  [
    "list",
    (t) => t.list("dev1", { metric: "active_power" }),
    [
      "GET",
      "/devices/dev1/timeseries",
      { searchParams: { metric: "active_power" } },
    ],
  ],
  [
    "getPoints",
    (t) => t.getPoints("dev1", "active_power", { last: "1h", limit: 100 }),
    [
      "GET",
      "/devices/dev1/timeseries/active_power",
      { searchParams: { last: "1h", limit: 100 } },
    ],
  ],
  [
    "aggregate",
    (t) => t.aggregate("dev1", "active_power", { agg: "avg", interval: "1h" }),
    [
      "GET",
      "/devices/dev1/timeseries/active_power/aggregate",
      { searchParams: { agg: "avg", interval: "1h" } },
    ],
  ],
  [
    "getAggregateOptions",
    (t) => t.getAggregateOptions({ last: "7d" }),
    [
      "GET",
      "/devices/timeseries/aggregate/options",
      { searchParams: { last: "7d" } },
    ],
  ],
  [
    "push",
    (t) => t.push("dev1", BULK_PUSH),
    ["POST", "/devices/dev1/timeseries", { body: BULK_PUSH }],
  ],
  [
    "pushAttribute",
    (t) => t.pushAttribute("dev1", "active_power", ATTR_PUSH),
    ["POST", "/devices/dev1/timeseries/active_power", { body: ATTR_PUSH }],
  ],
  [
    "exportCsv",
    (t) => t.exportCsv(EXPORT_PARAMS),
    [
      "GET",
      "/devices/timeseries/export/csv",
      { searchParams: EXPORT_PARAMS, responseType: "text" },
    ],
  ],
  [
    "exportPng",
    (t) => t.exportPng(EXPORT_PARAMS),
    [
      "GET",
      "/devices/timeseries/export/png",
      { searchParams: EXPORT_PARAMS, responseType: "blob" },
    ],
  ],
];

describe("TimeseriesResource", () => {
  it.each(CASES)(
    "%s calls the wire endpoint and returns the response",
    async (_label, invoke, expected) => {
      const { timeseries, request } = makeResource();

      await expect(invoke(timeseries)).resolves.toBe(RESULT);

      expect(request).toHaveBeenCalledExactlyOnceWith(...expected);
    },
  );

  it("CSV and PNG exports share the same query parameters", () => {
    expectTypeOf<TimeseriesExportParams>().toEqualTypeOf<
      NonNullable<
        operations["export_timeseries_png_devices_timeseries_export_png_get"]["parameters"]["query"]
      >
    >();
  });
});
