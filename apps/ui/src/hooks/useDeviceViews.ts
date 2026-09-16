import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import type { DeviceViewInput } from "@gridone/sdk";
import { saveGroupMembers } from "@/components/group-command/groupMembership";

export const viewsKey = ["device-views"];
export function useDeviceViews() {
  const client = useGridoneClient();
  return useQuery({
    queryKey: viewsKey,
    queryFn: () => client.deviceViews.list(),
  });
}
export function useDeviceView(id: string) {
  const client = useGridoneClient();
  return useQuery({
    queryKey: [...viewsKey, id],
    queryFn: () => client.deviceViews.get(id),
    enabled: !!id,
  });
}
export function useSaveDeviceView(id?: string) {
  const client = useGridoneClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (body: DeviceViewInput) =>
      id
        ? client.deviceViews.update(id, body)
        : client.deviceViews.create(body),
    onSuccess: () => cache.invalidateQueries({ queryKey: viewsKey }),
  });
}
export function useDeleteDeviceView(groupValue?: string | null) {
  const client = useGridoneClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (groupValue != null) await saveGroupMembers(client, groupValue, []);
      await client.deviceViews.delete(id);
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: viewsKey });
      void cache.invalidateQueries({ queryKey: ["devices"] });
      void cache.invalidateQueries({ queryKey: ["device"] });
      void cache.invalidateQueries({ queryKey: ["tag-facets"] });
    },
  });
}
