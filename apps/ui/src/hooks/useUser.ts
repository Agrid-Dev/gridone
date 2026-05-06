import { useQuery } from "@tanstack/react-query";
import { getUser } from "@/api/users";
import type { User } from "@/api/users";

export function useUser(userId: string | undefined): User | undefined {
  const { data } = useQuery({
    queryKey: ["users", userId],
    queryFn: () => getUser(userId!),
    enabled: !!userId,
  });
  return data;
}
