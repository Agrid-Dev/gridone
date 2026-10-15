import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  keepPreviousData,
  useQueries,
  useQueryClient,
} from "@tanstack/react-query";
import type { DriverLabels } from "@gridone/sdk";
import { useGridoneClient } from "./GridoneClientContext";

/**
 * What to call a device's attributes is declared by its driver and served
 * once per driver (`GET /drivers/{id}/labels`), not on every device payload.
 * Devices carry a `driver_revision` that moves when the driver changes, so
 * each labels document is cached under it for the lifetime of the page: the
 * first device of a driver fetches it, every other device of the same driver
 * reads it from memory.
 *
 * The registry is lazy. A component asking for a device's labels during
 * render is answered from what is loaded (the standard fallback meanwhile)
 * and the driver is requested after the render; the labels then appear on
 * the next one. No component has to know the drivers ahead of time.
 */

/** The part of a device that names its labels document. */
export type DriverRef = {
  driver_id: string;
  driver_revision?: string | null;
};

type DriverLabelsRegistry = {
  labelsOf(ref: DriverRef): DriverLabels | undefined;
  request(ref: DriverRef): void;
};

export function driverLabelsQueryKey(ref: DriverRef) {
  return ["driver-labels", ref.driver_id, ref.driver_revision ?? null] as const;
}

/** Without a provider nothing is fetched: labels fall back to the catalog. */
const NO_LABELS: DriverLabelsRegistry = {
  labelsOf: () => undefined,
  request: () => undefined,
};

const DriverLabelsContext = createContext<DriverLabelsRegistry>(NO_LABELS);

export function DriverLabelsProvider({ children }: { children: ReactNode }) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const [requested, setRequested] = useState<
    ReadonlyMap<string, string | null>
  >(() => new Map());
  const refs = useMemo<DriverRef[]>(
    () =>
      Array.from(requested, ([driver_id, driver_revision]) => ({
        driver_id,
        driver_revision,
      })),
    [requested],
  );
  const results = useQueries({
    queries: refs.map((ref) => ({
      queryKey: driverLabelsQueryKey(ref),
      queryFn: () => client.drivers.getLabels(ref.driver_id),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      // A driver edit moves the revision: keep the old wording until the new
      // document lands rather than flashing the fallback names.
      placeholderData: keepPreviousData,
    })),
  });
  const loaded = useMemo(
    () =>
      new Map(refs.map((ref, index) => [ref.driver_id, results[index]?.data])),
    [refs, results],
  );
  const request = useCallback((ref: DriverRef) => {
    const revision = ref.driver_revision ?? null;
    setRequested((previous) => {
      if (
        previous.has(ref.driver_id) &&
        previous.get(ref.driver_id) === revision
      )
        return previous;
      return new Map(previous).set(ref.driver_id, revision);
    });
  }, []);
  const labelsOf = useCallback(
    (ref: DriverRef) =>
      loaded.get(ref.driver_id) ??
      // A document another page already fetched (or a prefetch) is used on
      // the very first render, before the request below subscribes to it.
      queryClient.getQueryData<DriverLabels>(driverLabelsQueryKey(ref)),
    [loaded, queryClient],
  );
  const registry = useMemo(() => ({ labelsOf, request }), [labelsOf, request]);
  return (
    <DriverLabelsContext.Provider value={registry}>
      {children}
    </DriverLabelsContext.Provider>
  );
}

/**
 * A lookup of the labels document behind a device. Calling it during render
 * records the driver; the driver is requested once the render is committed,
 * and the component re-renders when the document arrives.
 */
export function useDriverLabelsLookup(): (
  ref: DriverRef,
) => DriverLabels | undefined {
  const registry = useContext(DriverLabelsContext);
  const seen = useRef(new Map<string, string | null>());
  useEffect(() => {
    if (seen.current.size === 0) return;
    const pending = Array.from(seen.current);
    seen.current.clear();
    for (const [driver_id, driver_revision] of pending)
      registry.request({ driver_id, driver_revision });
  });
  return useCallback(
    (ref: DriverRef) => {
      seen.current.set(ref.driver_id, ref.driver_revision ?? null);
      return registry.labelsOf(ref);
    },
    [registry],
  );
}

/**
 * A registry answering from documents given up front, for specs and
 * harnesses that render devices without an API.
 */
export function StaticDriverLabels({
  labels,
  children,
}: {
  labels: Record<string, DriverLabels>;
  children: ReactNode;
}) {
  const registry = useMemo<DriverLabelsRegistry>(
    () => ({
      labelsOf: (ref) => labels[ref.driver_id],
      request: () => undefined,
    }),
    [labels],
  );
  return (
    <DriverLabelsContext.Provider value={registry}>
      {children}
    </DriverLabelsContext.Provider>
  );
}
