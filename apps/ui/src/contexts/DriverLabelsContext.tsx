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
import { useQueries, useQueryClient } from "@tanstack/react-query";
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
 *
 * Documents are kept per `(driver, revision)`: after a driver edit, devices
 * read through different queries carry different revisions for a while, and
 * both must be served without the registry chasing one or the other. While
 * a new revision loads, the last document loaded for the driver answers, so
 * the wording never falls back to the catalogue under the user.
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

/** One entry per `(driver, revision)` pair. */
function pairKey(ref: DriverRef) {
  return `${ref.driver_id}\u0000${ref.driver_revision ?? ""}`;
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
  // Insertion order is request order: the last entry of a driver is the
  // revision most recently seen on a device.
  const [requested, setRequested] = useState<ReadonlyMap<string, DriverRef>>(
    () => new Map(),
  );
  const refs = useMemo(() => Array.from(requested.values()), [requested]);
  const results = useQueries({
    queries: refs.map((ref) => ({
      queryKey: driverLabelsQueryKey(ref),
      queryFn: () => client.drivers.getLabels(ref.driver_id),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
  });
  const loaded = useMemo(() => {
    const exact = new Map<string, DriverLabels>();
    const latestOfDriver = new Map<string, DriverLabels>();
    refs.forEach((ref, index) => {
      const document = results[index]?.data;
      if (!document) return;
      exact.set(pairKey(ref), document);
      latestOfDriver.set(ref.driver_id, document);
    });
    return { exact, latestOfDriver };
  }, [refs, results]);
  const request = useCallback((ref: DriverRef) => {
    const key = pairKey(ref);
    setRequested((previous) =>
      previous.has(key) ? previous : new Map(previous).set(key, ref),
    );
  }, []);
  const labelsOf = useCallback(
    (ref: DriverRef) =>
      loaded.exact.get(pairKey(ref)) ??
      // The revision is still loading: the driver's last loaded document
      // keeps naming its attributes meanwhile.
      loaded.latestOfDriver.get(ref.driver_id) ??
      // A document another page already fetched (or a prefetch) is used on
      // the very first render, before the request below subscribes to it.
      queryClient.getQueryData<DriverLabels>(driverLabelsQueryKey(ref)) ??
      queryClient
        .getQueriesData<DriverLabels>({
          queryKey: ["driver-labels", ref.driver_id],
        })
        .find(([, document]) => document !== undefined)?.[1],
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
  const seen = useRef(new Map<string, DriverRef>());
  useEffect(() => {
    if (seen.current.size === 0) return;
    const pending = Array.from(seen.current.values());
    seen.current.clear();
    for (const ref of pending) registry.request(ref);
  });
  return useCallback(
    (ref: DriverRef) => {
      seen.current.set(pairKey(ref), {
        driver_id: ref.driver_id,
        driver_revision: ref.driver_revision ?? null,
      });
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
