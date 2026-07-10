import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import * as z from "zod";

/** One provider's JSON schema, as served by ``GET /automations/triggers``. */
export type TriggerSchema = Record<string, unknown>;

type FormValues = Record<string, unknown>;

export function useGenericTriggerForm(
  schema: TriggerSchema,
  defaultValues?: FormValues,
) {
  const zodSchema = useMemo(() => z.fromJSONSchema(schema), [schema]);
  // Schema is generated from a runtime JSON Schema, so its static input type
  // is `unknown` — cast the resolver to align with the form values shape.
  const resolver = zodResolver(
    zodSchema as unknown as z.ZodType<FormValues, FormValues>,
  ) as Resolver<FormValues>;
  return useForm<FormValues>({
    resolver,
    mode: "onChange",
    defaultValues: defaultValues ?? {},
  });
}
