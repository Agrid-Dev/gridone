import {
  useSchemaForm,
  type SchemaFormValues,
} from "@/components/forms/schema-form";

/** One provider's JSON schema, as served by ``GET /automations/triggers``. */
export type TriggerSchema = Record<string, unknown>;

export function useGenericTriggerForm(
  schema: TriggerSchema,
  values?: SchemaFormValues,
) {
  return useSchemaForm({ schema, values, mode: "onChange" });
}
