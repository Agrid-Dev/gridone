import { useQuery } from "@tanstack/react-query";
import type { RegistrationRequestResponse } from "@gridone/sdk";
import { usePermissions } from "@/contexts/AuthContext";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

/** Registration requests still awaiting a decision.
 *
 *  Listing them takes `users:write`, so the query stays disabled for everyone
 *  else rather than firing a request the API would refuse. Apps register on
 *  their own schedule, so the count is polled — less often than the faults
 *  and devices counts, an unaccepted request being a matter of minutes. */
export function usePendingAppRequests() {
  const client = useGridoneClient();
  const can = usePermissions();

  const { data } = useQuery<RegistrationRequestResponse[]>({
    queryKey: ["registration-requests"],
    queryFn: () => client.apps.registrationRequests.list(),
    enabled: can("users:write"),
    refetchInterval: 30_000,
  });

  return {
    pendingCount: (data ?? []).filter((request) => request.status === "pending")
      .length,
  };
}
