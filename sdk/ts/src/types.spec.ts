/**
 * Compile-time assertions that the hand-written public types (`Page<T>`,
 * `Transport`, renamed aliases) stay in sync with the generated OpenAPI
 * types. Drift fails `tsc --noEmit` (and vitest's transform), not just this
 * suite.
 */
import { describe, expectTypeOf, it } from "vitest";

import type { components, paths } from "./generated/openapi";
import type {
  DataPoint,
  Driver,
  FetchPointsResultResponse,
  Page,
  TimeSeries,
  Transport,
  UnitCommand,
} from "./types";

type Schemas = components["schemas"];

describe("public types match the generated OpenAPI types", () => {
  it("Page<T> matches the generated paginated envelopes", () => {
    expectTypeOf<Page<UnitCommand>>().toEqualTypeOf<
      Schemas["PaginatedResponse_UnitCommand_"]
    >();
    expectTypeOf<Page<Schemas["NotificationDispatch"]>>().toEqualTypeOf<
      Schemas["PaginatedResponse_NotificationDispatch_"]
    >();
  });

  it("Transport matches the union served by the transports API", () => {
    type WireTransport =
      paths["/transports/{transport_id}"]["get"]["responses"]["200"]["content"]["application/json"];
    expectTypeOf<Transport>().toEqualTypeOf<WireTransport>();
  });

  it("renamed aliases point at the right schemas", () => {
    expectTypeOf<Driver>().toEqualTypeOf<
      paths["/drivers/{driver_id}"]["get"]["responses"]["200"]["content"]["application/json"]
    >();
    expectTypeOf<TimeSeries>().toEqualTypeOf<Schemas["TimeSeriesResponse"]>();
    expectTypeOf<FetchPointsResultResponse["points"]>().toEqualTypeOf<
      DataPoint[]
    >();
  });
});
