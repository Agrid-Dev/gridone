import type {
  TimeSeries,
  TimeseriesExportParams,
  UnitCommand,
  User,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useCommandsByIds } from "@/hooks/useCommandsByIds";
import { useDeviceSeries, useSeriesPoints } from "@/hooks/useDeviceTimeSeries";
import { useTimeRangeUrlState } from "@/hooks/useTimeRangeUrlState";
import { useUsers } from "@/hooks/useUsers";
import { type DeviceType, defaultVisibleAttributes } from "@/lib/devices";
import { downloadBlob } from "@/lib/download";
import {
  type TimeRange,
  type TimeRangePreset,
  resolveTimeRange,
} from "@/lib/timeRange";
import {
  holdLastRowUntil,
  mergeTimeSeries,
  type MergedRow,
} from "@/lib/mergeTimeSeries";
import { buildHistoryEvents, type HistoryEvent } from "./historyEvents";
import {
  type RefreshInterval,
  readStoredRefreshInterval,
  writeStoredRefreshInterval,
} from "./refreshPreference";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

/** Numeric pills shown before the "More…" picker takes over. */
export const MAX_PILL_ATTRIBUTES = 8;

/** State timelines shown under the chart. */
export const MAX_STATE_ATTRIBUTES = 5;

/** The history page reads live equipment but charts a whole day by default,
 *  matching its "what happened" framing (vs the 3h live-control default). */
export const HISTORY_DEFAULT_PRESET: TimeRangePreset = "1d";

function metricStorageKey(deviceId: string) {
  return `device-history-metric:${deviceId}`;
}

function readStoredMetric(deviceId: string): string | null {
  try {
    return localStorage.getItem(metricStorageKey(deviceId));
  } catch {
    return null;
  }
}

function writeStoredMetric(deviceId: string, metric: string) {
  try {
    localStorage.setItem(metricStorageKey(deviceId), metric);
  } catch {
    // Preference is a convenience; a full or disabled store is not an error.
  }
}

type DeviceHistoryContextValue = {
  series: TimeSeries[];
  dataTypes: Record<string, string>;
  /** The device's standard type, when it has one — value renderers key on it. */
  deviceType: DeviceType | undefined;
  /** Every numeric (float/int) attribute, offered through the "More…" picker. */
  numericAttributes: string[];
  /** The numeric attributes rendered as pills (standard schema, capped). */
  pillAttributes: string[];
  /** The str/bool attributes rendered as state timelines (capped). */
  stateAttributes: string[];
  activeMetric: string | null;
  setActiveMetric: (metric: string) => void;
  timeRange: TimeRange;
  applyRange: (range: TimeRange) => void;
  applyPreset: (preset: TimeRangePreset) => void;
  /** Rows held to the window end — chart and state timelines. */
  chartRows: MergedRow[];
  /** Value changes of the active metric + state attributes, newest first. */
  events: HistoryEvent[];
  /** True when the API truncated at least one fetched series. */
  hasTruncatedData: boolean;
  commandsMap: Map<number, UnitCommand>;
  usersMap: Map<string, User>;
  isLoading: boolean;
  error: Error | null;
  isDownloading: boolean;
  handleDownload: (format: "csv" | "png") => Promise<void>;
  /** Auto-refresh cadence in ms; 0 = off. */
  refreshInterval: RefreshInterval;
  setRefreshInterval: (interval: RefreshInterval) => void;
  refreshNow: () => void;
  /** True while any points query is (re)fetching — spins the refresh icon. */
  isRefreshing: boolean;
};

const DeviceHistoryContext = createContext<DeviceHistoryContextValue | null>(
  null,
);

type DeviceHistoryProviderProps = {
  deviceId: string;
  /** Attribute names in device declaration order. */
  attributeNames: string[];
  standardAttributeNames: string[];
  deviceType: DeviceType | undefined;
  children: ReactNode;
};

function isNumericType(dataType: string | undefined) {
  return dataType === "float" || dataType === "int";
}

function isStateType(dataType: string | undefined) {
  return dataType === "str" || dataType === "bool";
}

export function DeviceHistoryProvider({
  deviceId,
  attributeNames,
  standardAttributeNames,
  deviceType,
  children,
}: DeviceHistoryProviderProps) {
  const { t } = useTranslation("devices");
  const client = useGridoneClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { timeRange, applyRange, applyPreset } = useTimeRangeUrlState({
    defaultPreset: HISTORY_DEFAULT_PRESET,
    onChangeParamsReset: ["page"],
    storageKey: `device-history-period:${deviceId}`,
  });

  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);

  const {
    series,
    isLoading: seriesLoading,
    error: seriesError,
  } = useDeviceSeries(deviceId);

  const dataTypes = useMemo(
    () => Object.fromEntries(series.map((s) => [s.metric, s.data_type])),
    [series],
  );

  // Recorded attributes in device declaration order (declared first, then any
  // series the device no longer declares).
  const orderedAttributes = useMemo(() => {
    const available = new Set(series.map((s) => s.metric));
    const declared = attributeNames.filter((n) => available.has(n));
    const declaredSet = new Set(declared);
    const rest = series.map((s) => s.metric).filter((n) => !declaredSet.has(n));
    return [...declared, ...rest];
  }, [series, attributeNames]);

  const numericAttributes = useMemo(
    () => orderedAttributes.filter((a) => isNumericType(dataTypes[a])),
    [orderedAttributes, dataTypes],
  );

  const stateCandidates = useMemo(
    () => orderedAttributes.filter((a) => isStateType(dataTypes[a])),
    [orderedAttributes, dataTypes],
  );

  const pillAttributes = useMemo(
    () =>
      defaultVisibleAttributes(
        numericAttributes,
        standardAttributeNames,
        MAX_PILL_ATTRIBUTES,
      ),
    [numericAttributes, standardAttributeNames],
  );

  const stateAttributes = useMemo(
    () =>
      defaultVisibleAttributes(
        stateCandidates,
        standardAttributeNames,
        MAX_STATE_ATTRIBUTES,
      ),
    [stateCandidates, standardAttributeNames],
  );

  const defaultMetric = pillAttributes[0] ?? null;

  // Active metric: URL-first (?metric=), falling back to the remembered pick,
  // then the first pill. Invalid values fall through rather than erroring.
  const urlMetric = searchParams.get("metric");
  const activeMetric = useMemo(() => {
    if (numericAttributes.length === 0) return null;
    if (urlMetric && numericAttributes.includes(urlMetric)) return urlMetric;
    const stored = readStoredMetric(deviceId);
    if (stored && numericAttributes.includes(stored)) return stored;
    return defaultMetric;
  }, [numericAttributes, urlMetric, deviceId, defaultMetric]);

  // Seed a bare URL from the remembered metric so a copied link reproduces
  // the view (same contract as the remembered period).
  useEffect(() => {
    if (urlMetric || numericAttributes.length === 0) return;
    const stored = readStoredMetric(deviceId);
    if (!stored || stored === defaultMetric) return;
    if (!numericAttributes.includes(stored)) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("metric", stored);
        return next;
      },
      { replace: true },
    );
  }, [urlMetric, numericAttributes, deviceId, defaultMetric, setSearchParams]);

  const setActiveMetric = useCallback(
    (metric: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // The default metric produces no param, to keep URLs clean.
          if (metric === defaultMetric) next.delete("metric");
          else next.set("metric", metric);
          // The events table changes with the metric; restart its pagination.
          next.delete("page");
          return next;
        },
        { replace: true },
      );
      writeStoredMetric(deviceId, metric);
    },
    [setSearchParams, defaultMetric, deviceId],
  );

  // Fetch only the displayed series: the active metric plus the state
  // timelines. Everything else stays out of the request set entirely.
  const fetchedAttributes = useMemo(
    () => [...(activeMetric ? [activeMetric] : []), ...stateAttributes],
    [activeMetric, stateAttributes],
  );

  const selectedSeries = useMemo(
    () => series.filter((s) => fetchedAttributes.includes(s.metric)),
    [series, fetchedAttributes],
  );

  const [refreshInterval, setRefreshIntervalState] = useState<RefreshInterval>(
    readStoredRefreshInterval,
  );

  const setRefreshInterval = useCallback((interval: RefreshInterval) => {
    setRefreshIntervalState(interval);
    writeStoredRefreshInterval(interval);
  }, []);

  const {
    pointsByMetric,
    truncatedMetrics,
    isLoading: pointsLoading,
    isFetching: pointsFetching,
    error: pointsError,
  } = useSeriesPoints(
    selectedSeries,
    resolved.start,
    resolved.end,
    resolved.last,
    { refetchInterval: refreshInterval > 0 ? refreshInterval : false },
  );

  // Only the initial load blanks the page; fetches triggered by pill or range
  // changes keep the current UI mounted.
  const initialLoadDone = useRef(false);
  const isLoading =
    !initialLoadDone.current && (seriesLoading || pointsLoading);
  if (!isLoading) initialLoadDone.current = true;

  const error = seriesError ?? pointsError;

  const allRows = useMemo(
    () => mergeTimeSeries(pointsByMetric, fetchedAttributes),
    [pointsByMetric, fetchedAttributes],
  );

  // The chart draws the last values held to the window end; events keep
  // recorded rows only. Memoized against `allRows` so "now" is re-read when a
  // fetch lands rather than on every render — the trailing timestamp has to
  // hold still or the bands re-animate continuously.
  const chartRows = useMemo(
    () =>
      holdLastRowUntil(
        allRows,
        resolved.end ? new Date(resolved.end) : new Date(),
      ),
    [allRows, resolved.end],
  );

  const events = useMemo(
    () => buildHistoryEvents(allRows, activeMetric, stateAttributes),
    [allRows, activeMetric, stateAttributes],
  );

  const hasTruncatedData = truncatedMetrics.length > 0;

  const commandIds = useMemo(
    () => [
      ...new Set(
        events.map((e) => e.commandId).filter((id): id is number => id != null),
      ),
    ],
    [events],
  );

  const { commandsMap } = useCommandsByIds(commandIds);
  const { usersMap } = useUsers();

  const fetchedSeriesIds = useMemo(
    () => selectedSeries.map((s) => s.id),
    [selectedSeries],
  );

  const queryClient = useQueryClient();

  // Invalidation (rather than per-query refetch) keeps the trigger stable and
  // also refreshes the series list, so newly recorded attributes appear.
  const refreshNow = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["timeseries"] }),
    [queryClient],
  );

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(
    async (format: "csv" | "png") => {
      setIsDownloading(true);
      const params: TimeseriesExportParams = {
        series_ids: fetchedSeriesIds,
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
    [client, fetchedSeriesIds, resolved, t],
  );

  const value = useMemo<DeviceHistoryContextValue>(
    () => ({
      series,
      dataTypes,
      deviceType,
      numericAttributes,
      pillAttributes,
      stateAttributes,
      activeMetric,
      setActiveMetric,
      timeRange,
      applyRange,
      applyPreset,
      chartRows,
      events,
      hasTruncatedData,
      commandsMap,
      usersMap,
      isLoading,
      error,
      isDownloading,
      handleDownload,
      refreshInterval,
      setRefreshInterval,
      refreshNow,
      isRefreshing: pointsFetching,
    }),
    [
      series,
      dataTypes,
      deviceType,
      numericAttributes,
      pillAttributes,
      stateAttributes,
      activeMetric,
      setActiveMetric,
      timeRange,
      applyRange,
      applyPreset,
      chartRows,
      events,
      hasTruncatedData,
      commandsMap,
      usersMap,
      isLoading,
      error,
      isDownloading,
      handleDownload,
      refreshInterval,
      setRefreshInterval,
      refreshNow,
      pointsFetching,
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
