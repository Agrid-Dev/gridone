import { useQuery } from "@tanstack/react-query";
import type { User } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useUser(userId: string | undefined): User | undefined {
  const client = useGridoneClient();
  const { data } = useQuery({
    queryKey: ["users", userId],
    queryFn: () => client.users.get(userId!),
    enabled: !!userId,
  });
  return data;
}
