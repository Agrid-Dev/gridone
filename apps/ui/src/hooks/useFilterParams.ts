import { useSearchParams } from "react-router";
import { useMemo } from "react";
import type { DevicesFilter } from "@/api/devices";
import { readHealthParam } from "@/components/HealthFilter";

/** Read filter-related query params (`type`, `health`) and expose them as a
 *  ``DevicesFilter`` so the devices list reuses the same shape as the
 *  batch-command target and the backend applies the filter server-side.
 *  Returns ``undefined`` when no filter keys are present. */
export function useFilterParams(): DevicesFilter | undefined {
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const type = searchParams.get("type");
    const health = readHealthParam(searchParams);

    const filter: DevicesFilter = {};
    if (type) filter.types = [type];
    if (health !== "all") filter.isFaulty = health === "faulty";

    return Object.keys(filter).length === 0 ? undefined : filter;
  }, [searchParams]);
}
