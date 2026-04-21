import { useSearchParams } from "react-router";
import { useMemo } from "react";
import type { DevicesFilter } from "@/api/devices";

/** Read the `type` query param and expose it as a ``DevicesFilter`` so the
 *  devices list reuses the same shape as the batch-command target.
 *  Returns ``undefined`` when no filter keys are present. */
export function useFilterParams(): DevicesFilter | undefined {
  const [searchParams] = useSearchParams();

  return useMemo(() => {
    const type = searchParams.get("type");
    if (!type) return undefined;
    return { types: [type] };
  }, [searchParams]);
}
