import { useSearchParams } from "react-router";
import { useCallback, useMemo } from "react";
import type { DevicesFilter } from "@/lib/devices";

export type Health = "all" | "healthy" | "faulty";

/** Query params the devices list filters live in; `type` repeats, one
 *  value per selected type. */
export const FILTER_PARAMS = {
  type: "type",
  health: "health",
  search: "search",
} as const;

export type FilterParam = (typeof FILTER_PARAMS)[keyof typeof FILTER_PARAMS];

function isHealth(value: string | null): value is Health {
  return value === "all" || value === "healthy" || value === "faulty";
}

export function readHealthParam(searchParams: URLSearchParams): Health {
  const raw = searchParams.get(FILTER_PARAMS.health);
  return isHealth(raw) ? raw : "all";
}

/** Read the filter query params (`type`, `health`, `search`) as a
 *  ``DevicesFilter`` so the devices list reuses the same shape as the
 *  batch-command target and the backend applies the filter server-side.
 *  Returns ``undefined`` when no filter keys are present. */
export function useFilterParams(): DevicesFilter | undefined {
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const types = searchParams.getAll(FILTER_PARAMS.type).filter(Boolean);
    const health = readHealthParam(searchParams);
    const search = searchParams.get(FILTER_PARAMS.search)?.trim();

    const filter: DevicesFilter = {};
    if (types.length) filter.types = types;
    if (health !== "all") filter.is_faulty = health === "faulty";
    if (search) filter.search = search;

    return Object.keys(filter).length === 0 ? undefined : filter;
  }, [searchParams]);
}

/** Writers for the filter query params. Writes replace the history entry so
 *  toggling options does not pile up back-button steps. */
export function useSetFilterParams() {
  const [, setSearchParams] = useSearchParams();

  const setValues = useCallback(
    (param: FilterParam, values: readonly string[]) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(param);
          for (const value of values) next.append(param, value);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const clearAll = useCallback(
    () =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const param of Object.values(FILTER_PARAMS)) next.delete(param);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  return { setValues, clearAll };
}
