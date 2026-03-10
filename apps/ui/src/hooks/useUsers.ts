import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUsers, type User } from "@/api/users";

export function useUsers() {
  const query = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: listUsers,
    staleTime: 30_000,
  });

  const usersMap = useMemo(
    () => new Map((query.data ?? []).map((u) => [u.id, u])),
    [query.data],
  );

  return { users: query.data ?? [], usersMap, ...query };
}
