import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { Dashboard, LayoutItem } from "@gridone/sdk";
import { useUpdateLayout } from "./useDashboards";

export interface GridLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const EDIT_PARAM = "edit";
const EDIT_VALUE = "layout";

function toGrid(layout: LayoutItem[] | undefined): GridLayoutItem[] {
  return (layout ?? []).map((l) => ({
    i: l.i,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
  }));
}

function layoutsEqual(a: GridLayoutItem[], b: GridLayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((it) => [it.i, it]));
  return a.every((it) => {
    const other = byId.get(it.i);
    return (
      !!other &&
      other.x === it.x &&
      other.y === it.y &&
      other.w === it.w &&
      other.h === it.h
    );
  });
}

/**
 * Layout edit mode for a dashboard. Edit mode lives in the URL (`?edit=layout`)
 * so it survives a refresh; the working layout is local until Save persists it
 * (PUT layout) or Cancel discards it. Exposes a dirty flag and warns on browser
 * unload while dirty (in-app navigation is prevented by disabling the tabs).
 */
export function useLayoutEditor(dashboard: Dashboard) {
  const [searchParams, setSearchParams] = useSearchParams();
  const editing = searchParams.get(EDIT_PARAM) === EDIT_VALUE;
  const { updateLayout } = useUpdateLayout(dashboard.id);

  const storedLayout = useMemo(
    () => toGrid(dashboard.layout),
    [dashboard.layout],
  );
  const [workingLayout, setWorkingLayout] =
    useState<GridLayoutItem[]>(storedLayout);

  // Reset the working copy when the persisted layout changes (save/refetch or
  // switching dashboards) or when entering edit mode.
  useEffect(() => {
    setWorkingLayout(storedLayout);
  }, [storedLayout, editing]);

  const dirty = editing && !layoutsEqual(workingLayout, storedLayout);

  const enter = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(EDIT_PARAM, EDIT_VALUE);
      return next;
    });
  }, [setSearchParams]);

  const exit = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(EDIT_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const onLayoutChange = useCallback((layout: GridLayoutItem[]) => {
    setWorkingLayout(
      layout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })),
    );
  }, []);

  const save = useCallback(async () => {
    const items: LayoutItem[] = workingLayout.map((l) => ({
      i: l.i,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
    }));
    const ok = await updateLayout(items)
      .then(() => true)
      .catch(() => false);
    if (ok) exit();
  }, [workingLayout, updateLayout, exit]);

  const cancel = useCallback(() => {
    setWorkingLayout(storedLayout);
    exit();
  }, [storedLayout, exit]);

  // Warn on browser-level navigation (refresh / close) while there are unsaved
  // layout changes. In-app navigation is prevented by disabling the tabs.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  return {
    editing,
    layout: editing ? workingLayout : storedLayout,
    dirty,
    enter,
    save,
    cancel,
    onLayoutChange,
  };
}
