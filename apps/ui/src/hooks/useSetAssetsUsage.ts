import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AssetUsage } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

export type SetAssetsUsageInput = {
  assetIds: string[];
  /** `null` clears the classification. */
  usage: AssetUsage | null;
};

/** Classifies several room/zone assets in one call. The server applies the
 *  batch whole or not at all, so there is nothing to patch optimistically:
 *  every assets-rooted query is refetched on settle and the caller is told on
 *  success (typically to clear its selection). */
export function useSetAssetsUsage({
  onSuccess,
}: { onSuccess?: () => void } = {}) {
  const { t } = useTranslation("assets");
  const client = useGridoneClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetIds, usage }: SetAssetsUsageInput) =>
      client.assets.setUsage({ asset_ids: assetIds, usage }),
    onSuccess: ({ updated }) => {
      toast.success(t("selection.applied", { count: updated }));
      onSuccess?.();
    },
    onError: (err: unknown) =>
      toast.error(serverErrorMessage(err) ?? t("selection.applyFailed")),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["assets"] }),
  });
}
