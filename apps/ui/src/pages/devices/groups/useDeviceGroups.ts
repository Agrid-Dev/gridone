import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export const groupKey = ["device-groups"];

export function useDeviceGroups() {
  const client = useGridoneClient();
  return useQuery({
    queryKey: groupKey,
    queryFn: () => client.devices.groups.list(),
    refetchInterval: 10_000,
  });
}

export function useDeviceGroup(id: string) {
  const client = useGridoneClient();
  return useQuery({
    queryKey: [...groupKey, id],
    queryFn: () => client.devices.groups.get(id),
    enabled: !!id,
    refetchInterval: 10_000,
  });
}

export function useGroupReferences(id?: string) {
  const client = useGridoneClient();
  return useQuery({
    queryKey: [...groupKey, id, "references"],
    queryFn: () => client.devices.groups.references(id!),
    enabled: !!id,
  });
}

export function useDeleteGroup(id: string) {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => client.devices.groups.delete(id),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: groupKey });
      navigate("/devices/groups");
    },
  });
}
