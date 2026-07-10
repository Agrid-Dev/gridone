import type {
  TimeSeries,
  TimeseriesExportParams,
  UnitCommand,
  User,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useCommandsByIds } from "@/hooks/useCommandsByIds";
import { useDeviceSeries, useSeriesPoints } from "@/hooks/useDeviceTimeSeries";
import { useUsers } from "@/hooks/useUsers";
import type { VisibilityState } from "@tanstack/react-table";
import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { mergeTimeSeries, type MergedRow } from "./mergeTimeSeries";
import { parseRangeParams, resolveTimeRange } from "./timeRange";

const MAX_DEFAULT_VISIBLE = 5;

function storageKey(deviceId: string) {
  return `device-history-columns:${deviceId}`;
}

function readVisibility(deviceId: string): VisibilityState | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceId));
    return raw ? (JSON.parse(raw) as VisibilityState) : null;
  } catch {
    return null;
  }
}

function writeVisibility(deviceId: string, state: VisibilityState) {
  try {
    localStorage.setItem(storageKey(deviceId), JSON.stringify(state));
  } catch {
    // silently ignore storage errors
  }
}

/** Trigger a browser download of *blob* under *filename*. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type DeviceHistoryContextValue = {
  series: TimeSeries[];
  availableAttributes: string[];
  dataTypes: Record<string, string>;
  columnVisibility: VisibilityState;
  handleVisibilityChange: (
    updater: VisibilityState | ((prev: VisibilityState) => VisibilityState),
  ) => void;
  columnOrder: string[];
  setColumnOrder: React.Dispatch<React.SetStateAction<string[]>>;
  allRows: MergedRow[];
  visibleAttributes: string[];
  filteredRows: MergedRow[];
  commandsMap: Map<number, UnitCommand>;
  usersMap: Map<string, User>;
  isLoading: boolean;
  error: Error | null;
  isDownloading: boolean;
  handleDownload: (format: "csv" | "png") => Promise<void>;
};

const DeviceHistoryContext = createContext<DeviceHistoryContextValue | null>(
  null,
);

type DeviceHistoryProviderProps = {
  deviceId: string;
  attributeNames: string[];
  children: ReactNode;
};

export function DeviceHistoryProvider({
  deviceId,
  attributeNames,
  children,
}: DeviceHistoryProviderProps) {
  const { t } = useTranslation("devices");
  const client = useGridoneClient();
  const [searchParams] = useSearchParams();

  const timeRange = useMemo(
    () => parseRangeParams(searchParams),
    [searchParams],
  );

  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);

  const {
    series,
    isLoading: seriesLoading,
    error: seriesError,
  } = useDeviceSeries(deviceId);

  const availableAttributes = useMemo(
    () => series.map((s) => s.metric),
    [series],
  );

  const dataTypes = useMemo(
    () => Object.fromEntries(series.map((s) => [s.metric, s.data_type])),
    [series],
  );

  // Column visibility — persisted to localStorage
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => readVisibility(deviceId) ?? {},
  );

  // Apply defaults once when attributes first arrive and nothing is stored
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current) return;
    if (availableAttributes.length === 0) return;

    const stored = readVisibility(deviceId);
    if (stored && Object.keys(stored).length > 0) {
      defaultsApplied.current = true;
      return;
    }

    const ordered = attributeNames.filter((n) =>
      availableAttributes.includes(n),
    );
    const remaining = availableAttributes.filter(
      (n) => !attributeNames.includes(n),
    );
    const all = [...ordered, ...remaining];

    const defaults: VisibilityState = {};
    all.forEach((attr, i) => {
      defaults[attr] = i < MAX_DEFAULT_VISIBLE;
    });

    defaultsApplied.current = true;
    setColumnVisibility(defaults);
    writeVisibility(deviceId, defaults);
  }, [availableAttributes, attributeNames, deviceId]);

  // Column order — newly visible columns are appended to the right
  const [columnOrder, setColumnOrder] = useState<string[]>(["timestamp"]);

  // Seed column order once when attributes arrive
  useEffect(() => {
    if (availableAttributes.length === 0) return;
    setColumnOrder((prev) => {
      if (prev.length <= 1) {
        return ["timestamp", ...availableAttributes];
      }
      const missing = availableAttributes.filter((a) => !prev.includes(a));
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
  }, [availableAttributes]);

  // When columns go from hidden → visible, move them to the end
  const prevVisibilityRef = useRef<VisibilityState>(columnVisibility);
  useEffect(() => {
    const prev = prevVisibilityRef.current;
    prevVisibilityRef.current = columnVisibility;

    const newlyVisible = availableAttributes.filter(
      (attr) => columnVisibility[attr] !== false && prev[attr] === false,
    );
    if (newlyVisible.length > 0) {
      setColumnOrder((order) => {
        const without = order.filter((id) => !newlyVisible.includes(id));
        return [...without, ...newlyVisible];
      });
    }
  }, [columnVisibility, availableAttributes]);

  const handleVisibilityChange = useCallback(
    (
      updater: VisibilityState | ((prev: VisibilityState) => VisibilityState),
    ) => {
      setColumnVisibility((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        writeVisibility(deviceId, next);
        return next;
      });
    },
    [deviceId],
  );

  // Selection is unresolved until defaults are applied (or stored state
  // exists). Fetch nothing in the meantime so devices exposing hundreds of
  // attributes don't trigger a request burst on load.
  const visibilityReady = Object.keys(columnVisibility).length > 0;

  const visibleAttributes = useMemo(
    () =>
      visibilityReady
        ? availableAttributes.filter((attr) => columnVisibility[attr] !== false)
        : [],
    [availableAttributes, columnVisibility, visibilityReady],
  );

  // Only fetch points for the selected attributes; deselected series stay in
  // the React Query cache, so re-selecting fetches only what's missing.
  const selectedSeries = useMemo(
    () => series.filter((s) => visibleAttributes.includes(s.metric)),
    [series, visibleAttributes],
  );

  const {
    pointsByMetric,
    isLoading: pointsLoading,
    error: pointsError,
  } = useSeriesPoints(
    selectedSeries,
    resolved.start,
    resolved.end,
    resolved.last,
  );

  // Only the initial load blanks the page; incremental fetches triggered by
  // selection changes keep the current UI (toolbar, table) mounted.
  const initialLoadDone = useRef(false);
  const isLoading =
    !initialLoadDone.current &&
    (seriesLoading || pointsLoading || (series.length > 0 && !visibilityReady));
  if (!isLoading) initialLoadDone.current = true;

  const error = seriesError ?? pointsError;

  const allRows = useMemo(
    () => mergeTimeSeries(pointsByMetric, visibleAttributes),
    [pointsByMetric, visibleAttributes],
  );

  // Only keep rows where at least one visible attribute has a real data point
  const filteredRows = useMemo(
    () =>
      allRows.filter((row) =>
        visibleAttributes.some((attr) => row.isNew[attr]),
      ),
    [allRows, visibleAttributes],
  );

  // Collect unique command IDs from visible rows for batch fetching
  const commandIds = useMemo(() => {
    const ids = new Set<number>();
    for (const row of allRows) {
      for (const attr of visibleAttributes) {
        const id = row.commandIds[attr];
        if (id != null) ids.add(id);
      }
    }
    return [...ids];
  }, [allRows, visibleAttributes]);

  const { commandsMap } = useCommandsByIds(commandIds);
  const { usersMap } = useUsers();

  const visibleSeriesIds = useMemo(
    () =>
      columnOrder
        .filter((col) => col !== "timestamp" && visibleAttributes.includes(col))
        .flatMap((metric) =>
          series.filter((s) => s.metric === metric).map((s) => s.id),
        ),
    [series, visibleAttributes, columnOrder],
  );

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(
    async (format: "csv" | "png") => {
      setIsDownloading(true);
      const params: TimeseriesExportParams = {
        series_ids: visibleSeriesIds,
        start: resolved.start,
        end: resolved.end,
        last: resolved.last,
      };
      try {
        if (format === "png") {
          downloadBlob(await client.timeseries.exportPng(params), "export.png");
          toast.success(t("deviceDetails.downloadPngSuccess"));
        } else {
          const csv = await client.timeseries.exportCsv(params);
          downloadBlob(new Blob([csv], { type: "text/csv" }), "export.csv");
        }
      } catch {
        if (format === "png") toast.error(t("deviceDetails.downloadPngError"));
      } finally {
        setIsDownloading(false);
      }
    },
    [client, visibleSeriesIds, resolved, t],
  );

  const value = useMemo<DeviceHistoryContextValue>(
    () => ({
      series,
      availableAttributes,
      dataTypes,
      columnVisibility,
      handleVisibilityChange,
      columnOrder,
      setColumnOrder,
      allRows,
      visibleAttributes,
      filteredRows,
      commandsMap,
      usersMap,
      isLoading,
      error,
      isDownloading,
      handleDownload,
    }),
    [
      series,
      availableAttributes,
      dataTypes,
      columnVisibility,
      handleVisibilityChange,
      columnOrder,
      setColumnOrder,
      allRows,
      visibleAttributes,
      filteredRows,
      commandsMap,
      usersMap,
      isLoading,
      error,
      isDownloading,
      handleDownload,
    ],
  );

  return (
    <DeviceHistoryContext.Provider value={value}>
      {children}
    </DeviceHistoryContext.Provider>
  );
}

export function useDeviceHistoryContext(): DeviceHistoryContextValue {
  const ctx = useContext(DeviceHistoryContext);
  if (!ctx) {
    throw new Error(
      "useDeviceHistoryContext must be used within a DeviceHistoryProvider",
    );
  }
  return ctx;
}
