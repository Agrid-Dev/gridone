import { useQuery } from "@tanstack/react-query";
import { listNotifications } from "@/api/notifications";

export function useNotificationCount(): number {
  const { data } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => listNotifications({ dismissed: false, size: 1 }),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    select: (p) => p.total,
  });
  return data ?? 0;
}
