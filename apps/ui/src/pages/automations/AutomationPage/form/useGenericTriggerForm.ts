import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import type { TriggerSchema } from "@/api/automations";

export function useGenericTriggerForm(
  schema: TriggerSchema,
  defaultValues?: Record<string, unknown>,
) {
  const zodSchema = useMemo(() => z.fromJSONSchema(schema), [schema]);
  return useForm({
    resolver: zodResolver(zodSchema),
    mode: "onChange",
    defaultValues: defaultValues ?? {},
  });
}
