import { useSuspenseQuery } from "@tanstack/react-query";
import type { StandardAttributeSchema } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** The standard device-type schema catalog (`GET /devices/standard-types`).
 *  Static reference data, so it is cached indefinitely. */
export function useStandardTypes(): StandardAttributeSchema[] {
  const client = useGridoneClient();
  const { data } = useSuspenseQuery<StandardAttributeSchema[]>({
    queryKey: ["standard-types"],
    queryFn: () => client.devices.getStandardTypes(),
    staleTime: Infinity,
  });
  return data;
}
