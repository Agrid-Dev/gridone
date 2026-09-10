import { describe, expect, it, vi } from "vitest";
import { GridoneError, type GridoneClient } from "@gridone/sdk";
import { sdkPresentationApi } from "../sdkPresentationApi";

function setup() {
  const devices = { getPresentation: vi.fn(), getPresentationAsset: vi.fn() };
  const refresh = vi.fn().mockResolvedValue(undefined);
  return {
    devices,
    refresh,
    api: sdkPresentationApi({ devices } as unknown as GridoneClient, refresh),
  };
}
describe("SDK presentation adapter", () => {
  it("normalizes nullable diagnostic paths", async () => {
    const { api, devices } = setup();
    devices.getPresentation.mockResolvedValue({
      status: "unavailable",
      revision: "r",
      diagnostics: [{ code: "MISSING_ASSET", path: null }],
    });
    expect(await api.getPresentation("d", "r")).toMatchObject({
      diagnostics: [{ path: undefined }],
    });
  });
  it("forwards authenticated asset retrieval through the SDK", async () => {
    const { api, devices } = setup();
    const blob = new Blob(["image"]);
    devices.getPresentationAsset.mockResolvedValue(blob);
    expect(await api.getAsset("d", "r", "a")).toBe(blob);
    expect(devices.getPresentationAsset).toHaveBeenCalledWith("d", "r", "a");
  });
  it.each([409, 404, 500])(
    "refreshes only for an asset revision conflict (%s)",
    async (status) => {
      const { api, devices, refresh } = setup();
      const error = new GridoneError(status, "failed");
      devices.getPresentationAsset.mockRejectedValue(error);
      await expect(api.getAsset("d", "r", "a")).rejects.toBe(error);
      expect(refresh).toHaveBeenCalledTimes(status === 409 ? 1 : 0);
      expect(devices.getPresentationAsset).toHaveBeenCalledTimes(1);
    },
  );
  it("preserves the conflict when refreshing the device also fails", async () => {
    const { api, devices, refresh } = setup();
    const error = new GridoneError(409, "stale");
    devices.getPresentation.mockRejectedValue(error);
    refresh.mockRejectedValue(new Error("offline"));
    await expect(api.getPresentation("d", "r")).rejects.toBe(error);
    expect(refresh).toHaveBeenCalledWith("d");
    expect(devices.getPresentation).toHaveBeenCalledTimes(1);
  });
});
