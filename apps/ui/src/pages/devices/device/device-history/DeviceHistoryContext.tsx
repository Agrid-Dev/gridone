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
import type { VisibilityState } from "@tanstack/react-table";
import { useDeviceTimeSeries } from "@/hooks/useDeviceTimeSeries";
import { mergeTimeSeries, type MergedRow } from "./mergeTimeSeries";

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

type DeviceHistoryContextValue = {
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
  isLoading: boolean;
  error: Error | null;
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
  const { series, pointsByMetric, isLoading, error } =
    useDeviceTimeSeries(deviceId);

  const availableAttributes = useMemo(
    () => series.map((s) => s.metric),
    [series],
  );

  const dataTypes = useMemo(
    () => Object.fromEntries(series.map((s) => [s.metric, s.dataType])),
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

  // Merge all attributes once (stable — doesn't change with visibility)
  const allRows = useMemo(
    () => mergeTimeSeries(pointsByMetric, availableAttributes),
    [pointsByMetric, availableAttributes],
  );

  // Visible attributes (for row filtering only)
  const visibleAttributes = useMemo(
    () =>
      availableAttributes.filter((attr) => columnVisibility[attr] !== false),
    [availableAttributes, columnVisibility],
  );

  // Only keep rows where at least one visible attribute has a real data point
  const filteredRows = useMemo(
    () =>
      allRows.filter((row) =>
        visibleAttributes.some((attr) => row.isNew[attr]),
      ),
    [allRows, visibleAttributes],
  );

  const value = useMemo<DeviceHistoryContextValue>(
    () => ({
      availableAttributes,
      dataTypes,
      columnVisibility,
      handleVisibilityChange,
      columnOrder,
      setColumnOrder,
      allRows,
      visibleAttributes,
      filteredRows,
      isLoading,
      error,
    }),
    [
      availableAttributes,
      dataTypes,
      columnVisibility,
      handleVisibilityChange,
      columnOrder,
      setColumnOrder,
      allRows,
      visibleAttributes,
      filteredRows,
      isLoading,
      error,
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
