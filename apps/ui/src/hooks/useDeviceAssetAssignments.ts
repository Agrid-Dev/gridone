import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssetAssignment, AssetAssignmentResult } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** The device tag that carries zone membership — the same one
 *  {@link useDeviceAssetLink} writes one device at a time. */
export const ASSET_TAG = "asset_id";

/** One batch's outcome, split by what the server did with each row.
 *
 *  `unchanged` devices already sat in the requested zone; `failed` ones were
 *  not written at all and can be retried on their own — the batch is not a
 *  transaction, so the `applied` rows stay applied either way. */
export type AssignmentOutcome = {
  applied: AssetAssignmentResult[];
  unchanged: AssetAssignmentResult[];
  failed: AssetAssignmentResult[];
};

export function splitOutcome(
  results: AssetAssignmentResult[],
): AssignmentOutcome {
  return {
    applied: results.filter((r) => r.status === "applied"),
    unchanged: results.filter((r) => r.status === "unchanged"),
    failed: results.filter((r) => r.status === "failed"),
  };
}

/** Moves several devices into zones in one call, shared by the zone picker
 *  and the mapping import.
 *
 *  Membership lives in a device tag, so one batch goes stale on both sides:
 *  every assets-rooted query (the zone's device list, the tree with devices)
 *  and the device list, which carries `tags.asset_id`. Both are refreshed
 *  once for the whole batch rather than once per device, plus the detail
 *  cache of each device that actually moved.
 *
 *  Reporting is left to the caller: the picker wants a toast, the import
 *  wants a per-row table. */
export function useDeviceAssetAssignments() {
  const client = useGridoneClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assignments: AssetAssignment[]) => {
      const { results } = await client.devices.assignAssets(assignments);
      return splitOutcome(results);
    },
    onSuccess: (outcome) => {
      if (outcome.applied.length === 0) return;
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      for (const result of outcome.applied) {
        queryClient.invalidateQueries({
          queryKey: ["device", result.device_id],
        });
      }
    },
  });
}
