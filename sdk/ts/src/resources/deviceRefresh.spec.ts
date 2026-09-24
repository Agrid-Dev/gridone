import { describe, expect, it, vi } from "vitest";
import { DevicesResource } from "./devices";

describe("device refresh", () => {
  it("encodes identifiers and uses the read-only refresh operation", async () => {
    const request = vi.fn().mockResolvedValue({ current_value: 0.5 });
    const devices = new DevicesResource(request);
    expect(await devices.refreshAttribute("a/b", "step?x")).toEqual({
      current_value: 0.5,
    });
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "POST",
      "/devices/a%2Fb/attributes/step%3Fx/refresh",
    );
  });
});
