import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useDevicesList } from "@/hooks/useDevicesList";
import { tagToken } from "./viewFilters";

const schema = z
  .object({
    key: tagToken,
    values: z.string().min(1),
    newValue: z.string(),
    operation: z.enum(["add", "remove", "rename"]),
    ids: z.array(z.string()),
    search: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.key === "asset_id")
      ctx.addIssue({
        code: "custom",
        path: ["key"],
        message: "Use zone assignment",
      });
    const values = data.values.split(",").map((v) => v.trim());
    if (
      !values.every((v) => tagToken.safeParse(v).success) ||
      (data.operation === "rename" && values.length !== 1)
    )
      ctx.addIssue({
        code: "custom",
        path: ["values"],
        message: "Invalid values",
      });
    if (
      data.operation === "rename" &&
      !tagToken.safeParse(data.newValue).success
    )
      ctx.addIssue({
        code: "custom",
        path: ["newValue"],
        message: "Invalid value",
      });
    if (data.operation !== "rename" && !data.ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["ids"],
        message: "Select devices",
      });
  });
export function useTagEditor() {
  const client = useGridoneClient();
  const cache = useQueryClient();
  const [params] = useSearchParams();
  const devices = useDevicesList();
  const form = useForm<
    z.input<typeof schema>,
    unknown,
    z.output<typeof schema>
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      key: "",
      values: "",
      newValue: "",
      operation: "add",
      ids: params.getAll("ids"),
      search: "",
    },
  });
  const state = form.watch();
  const facets = useQuery({
    queryKey: ["tag-facets"],
    queryFn: () => client.devices.listTags(),
  });
  const mutation = useMutation({
    mutationFn: (data: z.output<typeof schema>) => {
      const values = data.values
        .split(",")
        .map((v) => tagToken.parse(v.trim()));
      return data.operation === "rename"
        ? client.devices.renameTag({
            key: data.key,
            old_value: values[0],
            new_value: tagToken.parse(data.newValue),
          })
        : client.devices.bulkTags({
            target: { ids: data.ids },
            key: data.key,
            values,
            operation: data.operation,
          });
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["devices"] });
      void cache.invalidateQueries({ queryKey: ["device"] });
      void cache.invalidateQueries({ queryKey: ["tag-facets"] });
    },
  });
  const submit = form.handleSubmit((data) => mutation.mutate(data));
  const visible = devices.devices.filter((d) =>
    `${d.name} ${d.id}`.toLowerCase().includes(state.search.toLowerCase()),
  );
  return { form, state, facets, devices, visible, submit, mutation };
}
