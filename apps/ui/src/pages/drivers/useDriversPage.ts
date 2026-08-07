import { useMemo } from "react";
import { useSearchParams } from "react-router";
import type { Driver } from "@gridone/sdk";
import { DEVICE_TYPE_ORDER, OTHER_KEY } from "@/lib/deviceTypes";
import { sortedByName } from "@/lib/sortByName";
import { useDrivers } from "./useDrivers";

export type DriverTypeCount = { type: string; count: number };

type DriversPage = {
  /** Drivers matching the `?type=` filter, alphabetically ordered. */
  drivers: Driver[];
  /** Unfiltered per-type counts for the filter chips, in display order. */
  typeCounts: DriverTypeCount[];
  /** Unfiltered catalog size. */
  total: number;
  loading: boolean;
  hasFilters: boolean;
};

/** Standard device types in catalog order. `other` is a fleet bucket for
 *  untyped devices; a driver without a type gets no chip of its own — it is
 *  only reachable through "all". */
const STANDARD_TYPES: readonly string[] = DEVICE_TYPE_ORDER.filter(
  (key) => key !== OTHER_KEY,
);

/** Driver count per type, standard types first (catalog order), then any
 *  vendor-specific type alphabetically. Untyped drivers are skipped. */
export function countDriversByType(
  drivers: readonly Driver[],
): DriverTypeCount[] {
  const counts = new Map<string, number>();
  for (const driver of drivers) {
    if (!driver.type) continue;
    counts.set(driver.type, (counts.get(driver.type) ?? 0) + 1);
  }
  const standard = STANDARD_TYPES.filter((type) => counts.has(type));
  const extra = [...counts.keys()]
    .filter((type) => !STANDARD_TYPES.includes(type))
    .sort((a, b) => a.localeCompare(b));
  return [...standard, ...extra].map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }));
}

/** Data layer of the drivers list page. The catalog is small and fetched
 *  whole (the chip counts need the unfiltered totals anyway), so the `?type=`
 *  filter is applied client-side rather than by a second request. */
export function useDriversPage(): DriversPage {
  const { driversListQuery } = useDrivers();
  const [searchParams] = useSearchParams();
  const selectedType = searchParams.get("type");
  const fetched = driversListQuery.data;

  const all = useMemo(() => sortedByName(fetched), [fetched]);
  const drivers = useMemo(
    () =>
      selectedType ? all.filter((driver) => driver.type === selectedType) : all,
    [all, selectedType],
  );
  const typeCounts = useMemo(() => countDriversByType(all), [all]);
  const initialLoading =
    driversListQuery.isLoading ||
    (!driversListQuery.isFetched && driversListQuery.isFetching);

  return {
    drivers,
    typeCounts,
    total: all.length,
    loading: initialLoading,
    hasFilters: !!selectedType,
  };
}
