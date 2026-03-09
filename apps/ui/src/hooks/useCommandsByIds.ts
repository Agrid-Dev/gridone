import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCommandsByIds, type DeviceCommand } from "@/api/commands";

export function useCommandsByIds(ids: number[]) {
  const sortedKey = useMemo(() => [...ids].sort((a, b) => a - b), [ids]);

  const query = useQuery({
    queryKey: ["commands", "byIds", sortedKey],
    queryFn: () => getCommandsByIds(sortedKey),
    enabled: sortedKey.length > 0,
    staleTime: 60_000,
  });

  const commandsMap = useMemo(
    () =>
      new Map(
        (query.data?.items ?? []).map((cmd: DeviceCommand) => [cmd.id, cmd]),
      ),
    [query.data],
  );

  return { commandsMap, ...query };
}
