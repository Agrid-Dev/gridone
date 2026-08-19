import { useQuery } from "@tanstack/react-query";
import type { TagGroupsResponse } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams, type DevicesFilter } from "@/lib/devices";

export type UseTagGroupsResult = {
  /** One entry per distinct tag value, plus `"untagged"`. Empty while
   *  loading or disabled. */
  groups: TagGroupsResponse["groups"];
  totalDevices: number;
  isLoading: boolean;
  error: Error | null;
};

/**
 * Preview how the device set matched by *filter* splits by *tagKey*
 * (`GET /devices/tag-groups`) — backs the group-by editor's match preview.
 *
 * *attribute*, when given, narrows the same way the aggregate endpoints do:
 * only devices exposing it are counted, so the preview matches what the
 * chart will actually group.
 */
export function useTagGroups(
  filter: DevicesFilter,
  tagKey: string,
  attribute?: string,
  opts?: { enabled?: boolean },
): UseTagGroupsResult {
  const client = useGridoneClient();
  const params = {
    ...devicesFilterToListParams(filter),
    tag_key: tagKey,
    attribute,
  };

  const { data, isLoading, error } = useQuery<TagGroupsResponse>({
    queryKey: ["device-tag-groups", params],
    queryFn: () => client.devices.listTagGroups(params),
    enabled: (opts?.enabled ?? true) && !!tagKey,
  });

  return {
    groups: data?.groups ?? [],
    totalDevices: data?.total_devices ?? 0,
    isLoading,
    error,
  };
}
