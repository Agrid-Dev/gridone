import { useSuspenseQuery } from "@tanstack/react-query";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useDeviceAutomations(deviceId: string) {
  const client = useGridoneClient();
  return useSuspenseQuery({
    queryKey: ["automations", "device", deviceId],
    queryFn: () => client.automations.list({ device_id: deviceId }),
  });
}
