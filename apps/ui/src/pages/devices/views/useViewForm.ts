import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { DeviceView } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useSaveDeviceView } from "@/hooks/useDeviceViews";
import { tagToken, parseTagCriteria, formatTagCriteria } from "./viewFilters";

const schema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string(),
  driverId: z.string(),
  tags: z.string().refine((text) => {
    try {
      parseTagCriteria(text);
      return true;
    } catch {
      return false;
    }
  }),
  groupBy: z.string().refine((text) => {
    if (!text.trim()) return true;
    const keys = text.split(",").map((key) => key.trim());
    return (
      keys.every((key) => tagToken.safeParse(key).success) &&
      new Set(keys.map((key) => tagToken.parse(key))).size === keys.length
    );
  }),
});
export function useViewForm(view?: DeviceView) {
  const navigate = useNavigate();
  const client = useGridoneClient();
  const save = useSaveDeviceView(view?.id);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: view?.name ?? "",
      description: view?.description ?? "",
      driverId: view?.filter?.driver_id ?? "",
      tags: formatTagCriteria(view?.filter?.tags),
      groupBy: view?.group_by.join(", ") ?? "",
    },
  });
  const facets = useQuery({
    queryKey: ["tag-facets"],
    queryFn: () => client.devices.listTags(),
  });
  const drivers = useQuery({
    queryKey: ["drivers"],
    queryFn: () => client.drivers.list(),
  });
  const submit = form.handleSubmit(async (values) => {
    const tags = parseTagCriteria(values.tags);
    const result = await save
      .mutateAsync({
        name: values.name,
        description: values.description || null,
        filter: {
          ...view?.filter,
          driver_id: values.driverId || null,
          tags: Object.keys(tags).length ? tags : null,
        },
        group_by: values.groupBy.trim()
          ? values.groupBy.split(",").map((key) => tagToken.parse(key.trim()))
          : [],
      })
      .catch(() => null);
    if (result) navigate(`/devices/views/${result.id}`);
  });
  return { form, submit, save, facets, drivers };
}
