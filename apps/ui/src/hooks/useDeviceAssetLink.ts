import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { ASSET_TAG } from "@/hooks/useDeviceAssetAssignments";

/** Detaches one device from the zone it sits in.
 *
 *  Linking goes the other way and comes in batches — see
 *  {@link useDeviceAssetAssignments}. Membership lives in a device tag, so a
 *  link change invalidates every assets-rooted query (the zone's device list,
 *  the tree with devices, the floor rollups) *and* the device list, which
 *  carries `tags.asset_id`. */
export function useDeviceAssetLink() {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { t } = useTranslation("assets");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["devices"] });
  };

  const unlink = useMutation({
    mutationFn: (deviceId: string) =>
      client.devices.deleteTag(deviceId, ASSET_TAG),
    onSuccess: () => {
      invalidate();
      toast.success(t("devices.unlinked"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { unlink };
}
