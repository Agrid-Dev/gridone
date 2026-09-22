import { describe, expect, it, vi } from "vitest";
import { GridoneClient } from "../client";
import type { OperatingRuleDefinition } from "../types";

describe("operatingRules", () => {
  it("filters by the target device and preserves typed conditions and revision checks", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({})));
    const client = new GridoneClient({
      baseUrl: "https://gridone.test",
      fetch,
    });
    const body: OperatingRuleDefinition = {
      name: "Interlock",
      explanation: "One at a time",
      target: { device_id: "pump/a", attribute: "command", value: true },
      condition: {
        op: "eq",
        left: { device_id: "b", attribute: "running" },
        right: false,
      },
    };
    await client.operatingRules.schemas();
    await client.operatingRules.list("pump/a");
    await client.operatingRules.get("rule/1");
    await client.operatingRules.create(body);
    await client.operatingRules.update("rule/1", { ...body, revision: 2 });
    await client.operatingRules.history("rule/1");
    await client.operatingRules.retire("rule/1", {
      reason: "Wiring removed",
      revision: 3,
    });
    await client.operatingRules.setEnabled("rule/1", {
      enabled: true,
      revision: 4,
    });
    await client.operatingRules.setEnabled("rule/1", {
      enabled: false,
      revision: 5,
    });
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await client.operatingRules.delete("rule/1", 6)).toBeUndefined();
    expect(
      fetch.mock.calls.map(([url, options]) => [url, options.method]),
    ).toEqual([
      ["https://gridone.test/operating-rules/schema", "GET"],
      ["https://gridone.test/operating-rules/?device_id=pump%2Fa", "GET"],
      ["https://gridone.test/operating-rules/rule%2F1", "GET"],
      ["https://gridone.test/operating-rules/", "POST"],
      ["https://gridone.test/operating-rules/rule%2F1", "PUT"],
      ["https://gridone.test/operating-rules/rule%2F1/history", "GET"],
      ["https://gridone.test/operating-rules/rule%2F1/retire", "POST"],
      ["https://gridone.test/operating-rules/rule%2F1/enabled", "PATCH"],
      ["https://gridone.test/operating-rules/rule%2F1/enabled", "PATCH"],
      ["https://gridone.test/operating-rules/rule%2F1?revision=6", "DELETE"],
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
    expect(JSON.parse(fetch.mock.calls[7]![1].body)).toEqual({
      enabled: true,
      revision: 4,
    });
    expect(JSON.parse(fetch.mock.calls[8]![1].body)).toEqual({
      enabled: false,
      revision: 5,
    });
  });
});
