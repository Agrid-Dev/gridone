import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { DeviceGroup } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { groupKey } from "./useDeviceGroups";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string(),
  driver_id: z.string().min(1),
  device_ids: z.array(z.string()),
});
export type GroupFormValues = z.infer<typeof schema>;

export function useGroupForm(group?: DeviceGroup) {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: group?.name ?? "",
      description: group?.description ?? "",
      driver_id: group?.driver_id ?? "",
      device_ids: group?.device_ids ?? [],
    },
  });
  const driverId = form.watch("driver_id");
  const { devices, loading, error: devicesError } = useDevicesList();
  const drivers = useQuery({
    queryKey: ["drivers"],
    queryFn: () => client.drivers.list(),
  });
  const compatible = useMemo(
    () =>
      devices.filter(
        (d) =>
          d.driver_id === driverId &&
          d.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [devices, driverId, search],
  );
  const save = useMutation({
    mutationFn: (values: GroupFormValues) =>
      group
        ? client.devices.groups.update(group.id, {
            name: values.name,
            description: values.description,
            device_ids: values.device_ids,
          })
        : client.devices.groups.create(values),
    onSuccess: (result) => {
      void cache.invalidateQueries({ queryKey: groupKey });
      navigate(`/devices/groups/${result.id}`);
    },
  });
  return {
    form,
    search,
    setSearch,
    compatible,
    drivers: drivers.data ?? [],
    loading: loading || drivers.isLoading,
    error: save.error || devicesError || drivers.error,
    saving: save.isPending,
    submit: form.handleSubmit((values) => save.mutate(values)),
    selectDriver: (id: string) => {
      form.setValue("driver_id", id);
      form.setValue("device_ids", []);
    },
  };
}
