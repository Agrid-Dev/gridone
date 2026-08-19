import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** The device tag that carries zone membership. Setting it links the device
 *  to an asset, deleting it unlinks the device from whichever asset it sat
 *  in — the same tag the API filters on (`?asset_id=`) and clears when an
 *  asset is deleted. */
const ASSET_TAG = "asset_id";

/** Both sides of the device/zone link for `assetId`.
 *
 *  Membership lives in a device tag, so a link change invalidates every
 *  assets-rooted query (the zone's device list, the tree with devices, the
 *  floor rollups) *and* the device list, which carries `tags.asset_id`. */
export function useDeviceAssetLink(assetId: string | undefined) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { t } = useTranslation("assets");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  };

  const link = useMutation({
    mutationFn: (deviceId: string) =>
      client.devices.setTag(deviceId, ASSET_TAG, assetId!),
    onSuccess: () => {
      invalidate();
      toast.success(t("devices.linked"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const unlink = useMutation({
    mutationFn: (deviceId: string) =>
      client.devices.deleteTag(deviceId, ASSET_TAG),
    onSuccess: () => {
      invalidate();
      toast.success(t("devices.unlinked"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { link, unlink };
}
