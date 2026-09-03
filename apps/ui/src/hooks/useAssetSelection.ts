import { useCallback, useMemo, useState } from "react";
import {
  selectionStateOf,
  usageCapableIdsUnder,
  type AssetTreeNode,
  type SelectionState,
} from "@/lib/assets";

export type AssetSelection = {
  /** Room and zone ids currently ticked — the only ids a batch ever sends. */
  selectedIds: ReadonlySet<string>;
  count: number;
  /** Tri-state of the checkbox standing for `node`'s subtree. */
  stateOf: (node: AssetTreeNode) => SelectionState;
  /** Ticks every room and zone beneath `node` (itself included when it is
   *  one), or clears them all when they were all ticked already. */
  toggle: (node: AssetTreeNode) => void;
  clear: () => void;
};

/** Multi-select over the asset tree for bulk classification. A checkbox on any
 *  level stands for the usage-capable ids beneath it, so a floor or building
 *  checkbox is a select-all shortcut while the selection itself only ever
 *  holds room and zone ids. */
export function useAssetSelection(): AssetSelection {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const stateOf = useCallback(
    (node: AssetTreeNode) =>
      selectionStateOf(usageCapableIdsUnder(node), selectedIds),
    [selectedIds],
  );

  const toggle = useCallback((node: AssetTreeNode) => {
    const ids = usageCapableIdsUnder(node);
    if (ids.length === 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => current.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return useMemo(
    () => ({ selectedIds, count: selectedIds.size, stateOf, toggle, clear }),
    [selectedIds, stateOf, toggle, clear],
  );
}
