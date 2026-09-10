import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Role } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

const ROLES_KEY = ["roles"];

/** The roles a user can be assigned to, as served by the API. */
export function useRoles(): UseQueryResult<Role[]> {
  const client = useGridoneClient();
  return useQuery({
    queryKey: ROLES_KEY,
    queryFn: () => client.users.listRoles(),
    staleTime: 5 * 60 * 1000,
  });
}
