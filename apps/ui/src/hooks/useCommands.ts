import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { getCommands } from "@/api/commands";
import type { Page } from "@/api/pagination";
import { toSearchString } from "@/api/pagination";
import type { DeviceCommand } from "@/api/commands";
import type { Device } from "@/api/devices";
import { listUsers, type User } from "@/api/users";
import { useDevicesList } from "@/hooks/useDevicesList";
import { buildCommandColumns } from "@/pages/devices/commands/columns";
import { DEFAULT_PRESET } from "@/lib/timeRange";

const DEFAULT_SORT = "desc";
const DEFAULT_SIZE = "20";

// ---------------------------------------------------------------------------
// Build the URLSearchParams sent to the API (and used as query key)
// ---------------------------------------------------------------------------

function buildApiParams(searchParams: URLSearchParams): URLSearchParams {
  const api = new URLSearchParams(searchParams);
  // Ensure defaults that are not in the URL
  if (!api.has("sort")) api.set("sort", DEFAULT_SORT);
  if (!api.has("size")) api.set("size", DEFAULT_SIZE);

  // "all" means no time constraint — remove the param for the API
  if (api.get("last") === "all") {
    api.delete("last");
  }
  // Default time range when no time params are present
  else if (!api.has("last") && !api.has("start") && !api.has("end")) {
    api.set("last", DEFAULT_PRESET);
  }

  return api;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useAttributeOptions(devices: Device[], deviceId: string | undefined) {
  return useMemo(() => {
    if (!deviceId) return [];
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return [];
    return Object.keys(device.attributes);
  }, [devices, deviceId]);
}

export function useCommands() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filter values from URL (already in API format)
  const deviceId = searchParams.get("device_id") ?? undefined;
  const attribute = searchParams.get("attribute") ?? undefined;
  const userId = searchParams.get("user_id") ?? undefined;

  // Data sources for filter dropdowns
  const { devices } = useDevicesList();
  const { data: users } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: listUsers,
    staleTime: 30000,
  });
  const attributeOptions = useAttributeOptions(devices, deviceId);

  // Build params for the API — URL params + defaults
  const apiParams = useMemo(() => buildApiParams(searchParams), [searchParams]);
  const queryKey = apiParams.toString();

  // Fetch commands
  const { data, isLoading, isPlaceholderData, error } = useQuery<
    Page<DeviceCommand>
  >({
    queryKey: ["commands", queryKey],
    queryFn: () => getCommands(apiParams),
    placeholderData: keepPreviousData,
    staleTime: 5000,
  });

  // Lookups for display names
  const deviceNames = useMemo(
    () =>
      Object.fromEntries(
        devices.filter((d) => d.name).map((d) => [d.id, d.name]),
      ),
    [devices],
  );

  const userNames = useMemo(
    () => Object.fromEntries((users ?? []).map((u) => [u.id, u.username])),
    [users],
  );

  const columns = useMemo(
    () => buildCommandColumns(t, { deviceNames, userNames }),
    [t, deviceNames, userNames],
  );

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? 0,
  });

  // Pagination link hrefs (extracted from API response)
  const prevHref = useMemo(
    () => toSearchString(data?.links.prev ?? null),
    [data?.links.prev],
  );
  const nextHref = useMemo(
    () => toSearchString(data?.links.next ?? null),
    [data?.links.next],
  );

  // URL param helpers
  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
          next.delete("page");
          if (key === "device_id") {
            next.delete("attribute");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return {
    // Filter state
    deviceId,
    attribute,
    userId,
    attributeOptions,
    devices,
    users,
    setFilter,

    // Table state
    table,
    data,
    isLoading,
    isPlaceholderData,
    error,
    prevHref,
    nextHref,
  };
}
