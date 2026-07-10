import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ProviderSchemas, Trigger } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useTriggerForm(initialValue?: Trigger) {
  const client = useGridoneClient();
  const { data: schemas, isLoading } = useQuery<ProviderSchemas>({
    queryKey: ["automations-trigger-schemas"],
    queryFn: () => client.automations.getTriggerSchemas(),
  });

  const [type, setType] = useState<string | undefined>(
    initialValue?.provider_id,
  );

  const schema = type && schemas ? schemas[type] : undefined;

  return {
    isLoading,
    availableTypes: schemas ? Object.keys(schemas) : [],
    type,
    setType,
    clearType: () => setType(undefined),
    schema,
    initialValueForType:
      initialValue && initialValue.provider_id === type
        ? initialValue
        : undefined,
  };
}
