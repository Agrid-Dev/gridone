import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { Device, DeviceView } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { viewsKey } from "@/hooks/useDeviceViews";
import {
  GROUP_TAG_KEY,
  createGroupTagValue,
  groupMembers,
  groupTagValue,
  saveGroupMembers,
} from "@/components/group-command/groupMembership";

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string(),
  ids: z.array(z.string()),
  search: z.string(),
  driverId: z.string(),
});

export function useGroupForm(devices: Device[], view?: DeviceView) {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const navigate = useNavigate();
  // A stable tag value keeps names freely editable, including spaces and accents.
  const [value] = useState(() =>
    view ? groupTagValue(view)! : createGroupTagValue(),
  );
  const [savedId, setSavedId] = useState(view?.id);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: view?.name ?? "",
      description: view?.description ?? "",
      ids: view ? groupMembers(devices, value).map((device) => device.id) : [],
      search: "",
      driverId: "",
    },
  });
  const state = form.watch();
  const visible = devices.filter(
    (device) =>
      (!state.driverId || device.driver_id === state.driverId) &&
      `${device.name} ${device.id}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  const driverIds = [
    ...new Set(devices.map((device) => device.driver_id)),
  ].sort();
  const save = useMutation({
    mutationFn: async (data: z.infer<typeof schema>) => {
      const body = {
        name: data.name,
        description: data.description || null,
        filter: { tags: { [GROUP_TAG_KEY]: [value] } },
        group_by: [],
      };
      // Create the display entry once. It matches no devices until tags are applied.
      // Keep its ID on partial failure so a retry never creates a second group.
      let id = savedId;
      let created: DeviceView | undefined;
      if (!id) {
        created = await client.deviceViews.create(body);
        id = created.id;
        setSavedId(id);
      }
      await saveGroupMembers(client, value, data.ids);
      return created ?? client.deviceViews.update(id, body);
    },
    onSuccess: (saved) => navigate(`/devices/views/${saved.id}`),
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: viewsKey });
      void cache.invalidateQueries({ queryKey: ["devices"] });
      void cache.invalidateQueries({ queryKey: ["device"] });
      void cache.invalidateQueries({ queryKey: ["tag-facets"] });
    },
  });
  const submit = form.handleSubmit((data) => save.mutate(data));
  return { form, state, visible, driverIds, save, submit, savedId };
}
