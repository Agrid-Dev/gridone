import { useQuery } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useAutomationDiagnostics(id: string) {
  const client = useGridoneClient();
  return useQuery({
    queryKey: ["automations", id, "diagnostics"],
    queryFn: () => client.automations.listDiagnostics(id),
  });
}
