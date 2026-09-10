import { isGridoneError, type GridoneClient } from "@gridone/sdk";
import type { PresentationApi } from "./useDevicePresentation";

/** Refresh the device contract after a 409; never retry an obsolete revision. */
export function sdkPresentationApi(
  client: GridoneClient,
  refreshDevice: (deviceId: string) => Promise<unknown>,
): PresentationApi {
  async function read<T>(
    deviceId: string,
    request: () => Promise<T>,
  ): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (isGridoneError(error) && error.status === 409) {
        await refreshDevice(deviceId).catch(() => undefined);
      }
      throw error;
    }
  }
  return {
    getPresentation: (deviceId, revision) =>
      read(deviceId, async () => {
        const response = await client.devices.getPresentation(deviceId, {
          revision,
        });
        if (response.status === "unavailable") {
          return {
            ...response,
            diagnostics: response.diagnostics.map((diagnostic) => ({
              ...diagnostic,
              path: diagnostic.path ?? undefined,
            })),
          };
        }
        return response;
      }),
    getAsset: (deviceId, revision, assetId) =>
      read(deviceId, () =>
        client.devices.getPresentationAsset(deviceId, revision, assetId),
      ),
  };
}
