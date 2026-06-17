import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BreadcrumbCrumb } from "@/lib/breadcrumbTrail";

type BreadcrumbContextValue = {
  registry: Map<string, BreadcrumbCrumb[]>;
  register: (id: string, crumbs: BreadcrumbCrumb[]) => void;
  unregister: (id: string) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

/** Holds the crumbs every mounted page/layout has registered. Wraps the whole
 *  authenticated shell so the header renderer and the route components share
 *  one registry. */
export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<Map<string, BreadcrumbCrumb[]>>(
    () => new Map(),
  );

  const register = useCallback((id: string, crumbs: BreadcrumbCrumb[]) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      next.set(id, crumbs);
      return next;
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setRegistry((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ registry, register, unregister }),
    [registry, register, unregister],
  );

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

/**
 * Registers the crumbs a route component owns for as long as it is mounted.
 * Callers pass the crumbs they can build from local data (entity names,
 * static labels) — typically their own segment plus any sibling-route
 * ancestors that aren't mounted as layouts.
 */
export function useBreadcrumb(crumbs: BreadcrumbCrumb[]): void {
  const ctx = useContext(BreadcrumbContext);
  const id = useId();
  // Serialize so the effect only re-runs when the crumbs actually change.
  const key = JSON.stringify(crumbs);
  // Depend on the stable callbacks, NOT the context value: the value's
  // identity changes on every registry update, which would re-run the effect
  // and re-register endlessly.
  const register = ctx?.register;
  const unregister = ctx?.unregister;

  useEffect(() => {
    if (!register || !unregister) return;
    register(id, crumbs);
    return () => unregister(id);
    // Intentionally keyed on the serialized `key`, not `crumbs` itself: callers
    // pass a fresh array each render, so depending on it would re-register
    // endlessly. register/unregister are stable.
  }, [register, unregister, id, key]);
}

/** Flat list of every registered crumb, for the header renderer. */
export function useRegisteredCrumbs(): BreadcrumbCrumb[] {
  const ctx = useContext(BreadcrumbContext);
  return useMemo(() => (ctx ? [...ctx.registry.values()].flat() : []), [ctx]);
}
