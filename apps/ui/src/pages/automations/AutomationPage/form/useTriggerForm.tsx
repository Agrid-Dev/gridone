import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  listTriggerSchemas,
  type Trigger,
  type TriggerSchema,
} from "@/api/automations";

export function useTriggerForm(initialValue?: Trigger) {
  const { data: schemas, isLoading } = useQuery<Record<string, TriggerSchema>>({
    queryKey: ["automations-trigger-schemas"],
    queryFn: listTriggerSchemas,
  });

  const [type, setType] = useState<string | undefined>(initialValue?.type);

  const schema = type && schemas ? schemas[type] : undefined;

  return {
    isLoading,
    availableTypes: schemas ? Object.keys(schemas) : [],
    type,
    setType,
    clearType: () => setType(undefined),
    schema,
    initialValueForType:
      initialValue && initialValue.type === type ? initialValue : undefined,
  };
}
