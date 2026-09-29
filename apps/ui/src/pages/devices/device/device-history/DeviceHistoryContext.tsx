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
import type { AttributeFields } from "@/lib/faults";
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
import {
  mergePanelOrder,
  readStoredPanelOrder,
  writeStoredPanelOrder,
} from "./panelOrder";
import {
  LEGACY_METRIC_PARAM,
  SELECTION_PARAM,
  canonicalSelection,
  parseSelectionParam,
  readStoredSelection,
  sameSelection,
  serializeSelection,
  writeStoredSelection,
} from "./selection";
import { cutAfterLastPoint } from "./truncatedRows";
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
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

/** How many attributes a first visit selects on a device with no standard
 *  schema to go by: the first recorded ones, capped so a driver exposing
 *  hundreds does not open on a wall of series. A standard device selects
 *  its schema attributes, however many. */
export const MAX_DEFAULT_ATTRIBUTES = 8;

/** The history page reads live equipment but charts a whole day by default,
 *  matching its "what happened" framing (vs the 3h live-control default). */
export const HISTORY_DEFAULT_PRESET: TimeRangePreset = "1d";

type DeviceHistoryContextValue = {
  series: TimeSeries[];
  dataTypes: Record<string, string>;
  /** What each attribute's driver declares about it — label, unit, wording
   *  of boolean states — keyed by attribute name. */
  attributes: Record<string, AttributeFields | undefined>;
  /** The device's standard type, when it has one — value renderers key on it. */
  deviceType: DeviceType | undefined;
  /** Every recorded attribute the device exposes to this user, in device
   *  declaration order. The one list both views select from. */
  availableAttributes: string[];
  /** The attributes both views show, in declaration order. */
  selectedAttributes: string[];
  setSelectedAttributes: (names: string[]) => void;
  toggleAttribute: (name: string) => void;
  timeRange: TimeRange;
  applyRange: (range: TimeRange) => void;
  applyPreset: (preset: TimeRangePreset) => void;
  /** Merged rows held to the window end — what the chart draws. */
  chartRows: MergedRow[];
  /** Merged rows where at least one selected attribute changed, newest
   *  first — what the table lists. */
  tableRows: MergedRow[];
  /** Selected attributes whose points the API cut short over the window. */
  truncatedAttributes: string[];
  /** The order the viewer arranged the chart's panels in, by panel key;
   *  remembered per device. */
  panelOrder: string[];
  setPanelOrder: (keys: string[]) => void;
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
  /** Display name used for export filenames; falls back to the id upstream. */
  deviceName: string;
  /** The device's attributes as the API exposes them to this user, in
   *  declaration order. Anything the user's role hides is already absent. */
  attributes: Record<string, AttributeFields>;
  standardAttributeNames: string[];
  deviceType: DeviceType | undefined;
  children: ReactNode;
};

/** "hall-thermostat-history-1d" — slugged device name plus the resolved
 *  window. Presets keep their duration ("1d"); custom windows use their
 *  dates ("...-history-2026-08-01_2026-08-11"); the all preset "all".
 *  The slug drops accents/symbols: e.g. "Ch. Étage 2" → "ch-etage-2". */
export function exportFilename(
  deviceName: string,
  resolved: { start?: string; end?: string; last?: string },
): string {
  const slug =
    deviceName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "device";
  const range =
    resolved.last ??
    (resolved.start
      ? `${resolved.start.slice(0, 10)}_${resolved.end?.slice(0, 10) ?? "now"}`
      : "all");
  return `${slug}-history-${range}`;
}

export function DeviceHistoryProvider({
  deviceId,
  deviceName,
  attributes,
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

  // Recorded attributes in device declaration order, then any series the
  // device no longer declares (a removed or renamed driver attribute keeps
  // its history). The series list is what the API exposes to this user —
  // role scoping is applied there — so it is trusted as is.
  const availableAttributes = useMemo(() => {
    const recorded = new Set(series.map((s) => s.metric));
    const declared = Object.keys(attributes).filter((name) =>
      recorded.has(name),
    );
    const declaredSet = new Set(declared);
    return [
      ...declared,
      ...series.map((s) => s.metric).filter((name) => !declaredSet.has(name)),
    ];
  }, [series, attributes]);

  // In declaration order like every selection, so the URL can tell the
  // default apart from a pick and leave it unwritten.
  const defaultSelection = useMemo(
    () =>
      canonicalSelection(
        defaultVisibleAttributes(
          availableAttributes,
          standardAttributeNames,
          MAX_DEFAULT_ATTRIBUTES,
        ),
        availableAttributes,
      ),
    [availableAttributes, standardAttributeNames],
  );

  // Selection: URL-first (?attrs=, or the former page's ?metric= as a
  // one-attribute alias so older links still open on their attribute),
  // falling back to the remembered pick, then the standard-schema default.
  // Names the device does not expose fall out.
  const urlSelection =
    searchParams.get(SELECTION_PARAM) ?? searchParams.get(LEGACY_METRIC_PARAM);
  const selectedAttributes = useMemo(() => {
    const fromUrl = parseSelectionParam(urlSelection, availableAttributes);
    if (fromUrl) return fromUrl;
    const stored = readStoredSelection(deviceId);
    if (stored) {
      const kept = canonicalSelection(stored, availableAttributes);
      if (kept.length > 0) return kept;
    }
    return defaultSelection;
  }, [urlSelection, availableAttributes, deviceId, defaultSelection]);

  const setSelectedAttributes = useCallback(
    (names: string[]) => {
      const next = canonicalSelection(names, availableAttributes);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          // The default selection produces no param, to keep URLs clean.
          if (sameSelection(next, defaultSelection))
            params.delete(SELECTION_PARAM);
          else params.set(SELECTION_PARAM, serializeSelection(next));
          params.delete(LEGACY_METRIC_PARAM);
          // The table changes with the selection; restart its pagination.
          params.delete("page");
          return params;
        },
        { replace: true },
      );
      writeStoredSelection(deviceId, next);
    },
    [setSearchParams, availableAttributes, defaultSelection, deviceId],
  );

  // Seed a bare URL from the remembered selection so a copied link reproduces
  // the view (same contract as the remembered period).
  useEffect(() => {
    if (urlSelection !== null || availableAttributes.length === 0) return;
    const stored = readStoredSelection(deviceId);
    if (!stored) return;
    const kept = canonicalSelection(stored, availableAttributes);
    if (kept.length === 0 || sameSelection(kept, defaultSelection)) return;
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set(SELECTION_PARAM, serializeSelection(kept));
        return params;
      },
      { replace: true },
    );
  }, [
    urlSelection,
    availableAttributes,
    deviceId,
    defaultSelection,
    setSearchParams,
  ]);

  const toggleAttribute = useCallback(
    (name: string) => {
      setSelectedAttributes(
        selectedAttributes.includes(name)
          ? selectedAttributes.filter((n) => n !== name)
          : [...selectedAttributes, name],
      );
    },
    [selectedAttributes, setSelectedAttributes],
  );

  // Fetch only the selected series. A deselected one stays in the query
  // cache, so growing the selection back fetches nothing again.
  const selectedSeries = useMemo(
    () => series.filter((s) => selectedAttributes.includes(s.metric)),
    [series, selectedAttributes],
  );

  const {
    pointsByMetric,
    truncatedMetrics,
    isLoading: pointsLoading,
    error: pointsError,
  } = useSeriesPoints(
    selectedSeries,
    resolved.start,
    resolved.end,
    resolved.last,
  );

  // Only the initial load blanks the page; fetches triggered by selection or
  // range changes keep the current UI mounted.
  const initialLoadDone = useRef(false);
  const isLoading =
    !initialLoadDone.current && (seriesLoading || pointsLoading);
  if (!isLoading) initialLoadDone.current = true;

  const error = seriesError ?? pointsError;

  // A truncated series was cut short by the API: nothing is known of it
  // past its last fetched point, so it stops there rather than being
  // carried flat to the window's end as if the device had held it.
  const allRows = useMemo(
    () =>
      cutAfterLastPoint(
        mergeTimeSeries(pointsByMetric, selectedAttributes),
        pointsByMetric,
        truncatedMetrics,
      ),
    [pointsByMetric, selectedAttributes, truncatedMetrics],
  );

  // The chart draws the last values held to the window end. Memoized against
  // `allRows` so "now" is re-read when a fetch lands rather than on every
  // render — the trailing timestamp has to hold still or the bands
  // re-animate continuously.
  const chartRows = useMemo(
    () =>
      holdLastRowUntil(
        allRows,
        resolved.end ? new Date(resolved.end) : new Date(),
      ),
    [allRows, resolved.end],
  );

  // The table lists an instant when something changed at it; forward-filled
  // cells on such a row read as the values in force then.
  const tableRows = useMemo(
    () =>
      allRows
        .filter((row) => selectedAttributes.some((name) => row.isNew[name]))
        .reverse(),
    [allRows, selectedAttributes],
  );

  const commandIds = useMemo(
    () => [
      ...new Set(
        tableRows.flatMap((row) =>
          Object.values(row.commandIds).filter(
            (id): id is number => id != null,
          ),
        ),
      ),
    ],
    [tableRows],
  );

  const { commandsMap } = useCommandsByIds(commandIds);
  const { usersMap } = useUsers();

  const [panelOrder, setPanelOrderState] = useState<string[]>(
    () => readStoredPanelOrder(deviceId) ?? [],
  );
  // A drop reports the order of the panels on screen; panels of deselected
  // attributes keep their remembered place around them.
  const setPanelOrder = useCallback(
    (keys: string[]) => {
      setPanelOrderState((remembered) => {
        const next = mergePanelOrder(remembered, keys);
        writeStoredPanelOrder(deviceId, next);
        return next;
      });
    },
    [deviceId],
  );

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(
    async (format: "csv" | "png") => {
      setIsDownloading(true);
      const params: TimeseriesExportParams = {
        series_ids: selectedSeries.map((s) => s.id),
        start: resolved.start,
        end: resolved.end,
        last: resolved.last,
      };
      const filename = exportFilename(deviceName, resolved);
      try {
        if (format === "png") {
          downloadBlob(
            await client.timeseries.exportPng(params),
            `${filename}.png`,
          );
          toast.success(t("deviceDetails.downloadPngSuccess"));
        } else {
          const csv = await client.timeseries.exportCsv(params);
          downloadBlob(
            new Blob([csv], { type: "text/csv" }),
            `${filename}.csv`,
          );
        }
      } catch {
        toast.error(
          t(
            format === "png"
              ? "deviceDetails.downloadPngError"
              : "deviceDetails.downloadCsvError",
          ),
        );
      } finally {
        setIsDownloading(false);
      }
    },
    [client, deviceName, selectedSeries, resolved, t],
  );

  const value = useMemo<DeviceHistoryContextValue>(
    () => ({
      series,
      dataTypes,
      attributes,
      deviceType,
      availableAttributes,
      selectedAttributes,
      setSelectedAttributes,
      toggleAttribute,
      timeRange,
      applyRange,
      applyPreset,
      chartRows,
      tableRows,
      truncatedAttributes: truncatedMetrics,
      panelOrder,
      setPanelOrder,
      commandsMap,
      usersMap,
      isLoading,
      error,
      isDownloading,
      handleDownload,
    }),
    [
      series,
      dataTypes,
      attributes,
      deviceType,
      availableAttributes,
      selectedAttributes,
      setSelectedAttributes,
      toggleAttribute,
      timeRange,
      applyRange,
      applyPreset,
      chartRows,
      tableRows,
      truncatedMetrics,
      panelOrder,
      setPanelOrder,
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
