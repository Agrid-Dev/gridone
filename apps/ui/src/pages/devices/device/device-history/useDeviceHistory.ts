import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useDeviceTimeSeries } from "@/hooks/useDeviceTimeSeries";
import { mergeTimeSeries } from "./mergeTimeSeries";
import { buildColumns } from "./columns";

const PAGE_SIZE = 20;
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

export function useDeviceHistory(deviceId: string, attributeNames: string[]) {
  const { t } = useTranslation();
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
      // If new series appeared, append them
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

  const columns = useMemo(
    () => buildColumns(availableAttributes, dataTypes, t),
    [availableAttributes, dataTypes, t],
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

  // URL-synced pagination (1-based in URL, 0-based internally)
  const [searchParams, setSearchParams] = useSearchParams();
  const pageIndex = Math.max(0, Number(searchParams.get("page") ?? "1") - 1);

  const handlePaginationChange = useCallback(
    (
      updater: PaginationState | ((prev: PaginationState) => PaginationState),
    ) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize: PAGE_SIZE })
          : updater;
      setSearchParams(
        next.pageIndex === 0 ? {} : { page: String(next.pageIndex + 1) },
        { replace: true },
      );
    },
    [pageIndex, setSearchParams],
  );

  // Clamp to last page when current page exceeds page count
  const maxPage = Math.max(0, Math.ceil(filteredRows.length / PAGE_SIZE) - 1);
  useEffect(() => {
    if (filteredRows.length > 0 && pageIndex > maxPage) {
      setSearchParams(maxPage === 0 ? {} : { page: String(maxPage + 1) }, {
        replace: true,
      });
    }
  }, [filteredRows.length, pageIndex, maxPage, setSearchParams]);

  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnOrder,
      pagination: { pageIndex, pageSize: PAGE_SIZE },
    },
    onSortingChange: setSorting,
    onPaginationChange: handlePaginationChange,
    onColumnVisibilityChange: handleVisibilityChange,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
  });

  return { table, isLoading, error, availableAttributes };
}
