import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ResourceHeader } from "@/components/ResourceHeader";
import {
  type TimeRange,
  parseRangeParams,
  writeRangeParams,
  resolveTimeRange,
} from "@/lib/timeRange";
import { useCommandsTable } from "@/hooks/useCommands";
import { useDevicesList } from "@/hooks/useDevicesList";
import { listUsers } from "@/api/users";
import type { Device } from "@/api/devices";
import { CommandsFilterBar } from "./CommandsFilterBar";
import { CommandsTable } from "./CommandsTable";

const PAGE_SIZE = 20;

function useAttributeOptions(devices: Device[], deviceId: string | undefined) {
  return useMemo(() => {
    if (!deviceId) return [];
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return [];
    return Object.keys(device.attributes);
  }, [devices, deviceId]);
}

export default function CommandsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse filters from URL
  const deviceId = searchParams.get("device_id") ?? undefined;
  const attribute = searchParams.get("attribute") ?? undefined;
  const userId = searchParams.get("user_id") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const [timeRange, setTimeRangeState] = useState<TimeRange>(() =>
    parseRangeParams(searchParams),
  );

  const setTimeRange = useCallback(
    (range: TimeRange) => {
      setTimeRangeState(range);
      setSearchParams(
        (prev) => {
          const next = writeRangeParams(prev, range);
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);

  // Data sources for filter dropdowns
  const { devices } = useDevicesList();
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: listUsers,
    staleTime: 30000,
  });
  const attributeOptions = useAttributeOptions(devices, deviceId);

  const filters = useMemo(
    () => ({
      deviceId,
      attribute,
      userId,
      start: resolved.start,
      end: resolved.end,
      last: resolved.last,
      sort: "desc" as const,
      page,
      size: PAGE_SIZE,
    }),
    [deviceId, attribute, userId, resolved, page],
  );

  const { data, isLoading, isPlaceholderData, error, table } = useCommandsTable(
    filters,
    devices,
    users,
  );

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

  const goToPage = useCallback(
    (newPage: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newPage <= 1) {
            next.delete("page");
          } else {
            next.set("page", String(newPage));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("commands.subtitle")}
        resourceName={t("devices.title")}
        resourceNameLinksBack
      />

      <CommandsFilterBar
        deviceId={deviceId}
        attribute={attribute}
        userId={userId}
        attributeOptions={attributeOptions}
        devices={devices}
        users={users}
        timeRange={timeRange}
        onFilterChange={setFilter}
        onTimeRangeChange={setTimeRange}
      />

      <CommandsTable
        table={table}
        total={data?.total ?? 0}
        page={data?.page ?? page}
        size={data?.size ?? PAGE_SIZE}
        totalPages={data?.totalPages ?? 0}
        links={data?.links}
        isLoading={isLoading}
        isPlaceholderData={isPlaceholderData}
        error={error}
        onPageChange={goToPage}
      />
    </section>
  );
}
