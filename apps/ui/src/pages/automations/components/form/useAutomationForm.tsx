import { listTriggerSchemas, TriggerSchema } from "@/api/automations";
import { useQuery } from "@tanstack/react-query";

export const useAutomationForm = () => {
  const { data: triggerSchemas, isLoading } = useQuery<
    Record<string, TriggerSchema>
  >({
    queryKey: ["automations-trigger-schemas"],
    queryFn: listTriggerSchemas,
  });

  return { triggerSchemas, isLoading };
};
