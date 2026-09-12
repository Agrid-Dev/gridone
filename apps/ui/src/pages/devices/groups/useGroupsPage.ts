import { useMemo, useState } from "react";
import { useDeviceGroups } from "./useDeviceGroups";

export function useGroupsPage() {
  const query = useDeviceGroups();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const groups = useMemo(
    () =>
      (query.data ?? []).filter((group) =>
        [group.name, group.description, group.driver_id].some((value) =>
          value?.toLowerCase().includes(term),
        ),
      ),
    [query.data, term],
  );
  return {
    ...query,
    groups,
    search,
    setSearch,
    filtered: !!term,
    total: query.data?.length ?? 0,
  };
}
