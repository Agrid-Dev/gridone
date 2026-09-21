import { describe, expect, it, vi } from "vitest";
import { GridoneClient } from "../client";
import type { ProtectionDefinition } from "../types";

describe("protections", () => {
  it("filters by the target device and preserves typed conditions and revision checks", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({})));
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    const body: ProtectionDefinition = {
      name: "Interlock",
      explanation: "One at a time",
      target: { device_id: "pump/a", attribute: "command", value: true },
      condition: {
        op: "eq",
        left: { device_id: "b", attribute: "running" },
        right: false,
      },
    };
    await client.protections.schemas();
    await client.protections.list("pump/a");
    await client.protections.get("rule/1");
    await client.protections.create(body);
    await client.protections.update("rule/1", { ...body, revision: 2 });
    await client.protections.history("rule/1");
    await client.protections.retire("rule/1", {
      reason: "Wiring removed",
      revision: 3,
    });
    expect(
      fetch.mock.calls.map(([url, options]) => [url, options.method]),
    ).toEqual([
      ["https://gridone.test/protections/schema", "GET"],
      ["https://gridone.test/protections/?device_id=pump%2Fa", "GET"],
      ["https://gridone.test/protections/rule%2F1", "GET"],
      ["https://gridone.test/protections/", "POST"],
      ["https://gridone.test/protections/rule%2F1", "PUT"],
      ["https://gridone.test/protections/rule%2F1/history", "GET"],
      ["https://gridone.test/protections/rule%2F1/retire", "POST"],
    ]);
    expect(JSON.parse(fetch.mock.calls[3]![1].body)).toEqual(body);
    expect(JSON.parse(fetch.mock.calls[4]![1].body)).toEqual({
      ...body,
      revision: 2,
    });
    expect(JSON.parse(fetch.mock.calls[6]![1].body)).toEqual({
      reason: "Wiring removed",
      revision: 3,
    });
  });
});
