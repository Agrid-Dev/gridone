import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export function useUsers() {
  const client = useGridoneClient();
  const query = useQuery<User[]>({
    queryKey: ["users"],
    // Callers without `users:read` receive `UserBasic` objects (id + name); the
    // consumers here only rely on fields present in both shapes.
    queryFn: () => client.users.list() as Promise<User[]>,
    staleTime: 30_000,
  });

  const usersMap = useMemo(
    () => new Map((query.data ?? []).map((u) => [u.id, u])),
    [query.data],
  );

  return { users: query.data ?? [], usersMap, ...query };
}
