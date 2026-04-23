import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { getCommands, getDeviceCommands, listTemplates } from "@/api/commands";
import type { Page } from "@/api/pagination";
import { toSearchString } from "@/api/pagination";
import type { CommandTemplate, DeviceCommand } from "@/api/commands";
import type { Device } from "@/api/devices";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useUsers } from "@/hooks/useUsers";
import { buildCommandColumns } from "@/pages/devices/commands/columns";
import { DEFAULT_PRESET } from "@/lib/timeRange";

const DEFAULT_SORT = "desc";
const DEFAULT_SIZE = "20";

// Polling cadence — fast while any command is pending, slow otherwise.
// Fast polling is capped: once the oldest pending command has been pending
// longer than POLL_FAST_CAP_MS (e.g. the device is offline or the broker is
// stuck), fall back to slow polling to avoid hammering the API indefinitely.
const POLL_FAST_MS = 1500;
const POLL_SLOW_MS = 15_000;
const POLL_FAST_CAP_MS = 5 * 60 * 1000;

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

type UseCommandsOptions = {
  /** When set, uses the device-specific endpoint and hides the device filter. */
  deviceId?: string;
};

function useAttributeOptions(devices: Device[], deviceId: string | undefined) {
  return useMemo(() => {
    if (!deviceId) return [];
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return [];
    // Use attribute.name (original snake_case) rather than the object key
    // which has been camelCased by the API response transform.
    return Object.values(device.attributes)
      .filter((attr) => attr.readWriteModes.includes("write"))
      .map((attr) => attr.name);
  }, [devices, deviceId]);
}

export function useCommands({
  deviceId: fixedDeviceId,
}: UseCommandsOptions = {}) {
  const { t } = useTranslation("devices");
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filter values from URL (already in API format)
  const deviceId = fixedDeviceId ?? searchParams.get("device_id") ?? undefined;
  const attribute = searchParams.get("attribute") ?? undefined;
  const userId = searchParams.get("user_id") ?? undefined;
  const batchId = searchParams.get("batch_id") ?? undefined;
  const templateId = searchParams.get("template_id") ?? undefined;

  // Data sources for filter dropdowns
  const { devices } = useDevicesList();
  const { users } = useUsers();
  const attributeOptions = useAttributeOptions(devices, deviceId);

  // Templates list — used for both the filter dropdown and the table column
  // name lookup. Low cardinality (user-saved only), so one cached fetch is
  // plenty for both the list and the detail pages.
  const { data: templatesPage } = useQuery<Page<CommandTemplate>>({
    queryKey: ["command-templates"],
    queryFn: () => listTemplates(),
    staleTime: 30_000,
  });
  const templates = templatesPage?.items ?? [];

  // Build params for the API — URL params + defaults
  const apiParams = useMemo(() => {
    const params = buildApiParams(searchParams);
    // When using device-specific endpoint, device_id is in the URL path
    if (fixedDeviceId) params.delete("device_id");
    return params;
  }, [searchParams, fixedDeviceId]);
  const queryKey = apiParams.toString();

  // Fetch commands. Polling is always on: fast when any row is still pending,
  // slow otherwise. The function form lets it self-adjust as rows transition.
  const { data, isLoading, isPlaceholderData, error } = useQuery<
    Page<DeviceCommand>
  >({
    queryKey: ["commands", fixedDeviceId ?? "all", queryKey],
    queryFn: () =>
      fixedDeviceId
        ? getDeviceCommands(fixedDeviceId, apiParams)
        : getCommands(apiParams),
    placeholderData: keepPreviousData,
    staleTime: 5000,
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const pending = items.filter((c) => c.status === "pending");
      if (pending.length === 0) return POLL_SLOW_MS;
      const oldestPendingMs = Math.min(
        ...pending.map((c) => new Date(c.createdAt).getTime()),
      );
      const age = Date.now() - oldestPendingMs;
      return age > POLL_FAST_CAP_MS ? POLL_SLOW_MS : POLL_FAST_MS;
    },
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
    () => Object.fromEntries(users.map((u) => [u.id, u.username])),
    [users],
  );

  const templateNames = useMemo(
    () =>
      Object.fromEntries(
        templates.filter((tpl) => tpl.name).map((tpl) => [tpl.id, tpl.name!]),
      ),
    [templates],
  );

  const columns = useMemo(
    () =>
      buildCommandColumns(t, {
        deviceNames,
        userNames,
        templateNames,
        showDevice: !fixedDeviceId,
      }),
    [t, deviceNames, userNames, templateNames, fixedDeviceId],
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
    batchId,
    templateId,
    attributeOptions,
    devices,
    users,
    templates,
    setFilter,
    isDeviceFixed: !!fixedDeviceId,

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
