import { FC } from "react";
import type { Asset } from "@gridone/sdk";
import { ancestorPathOf } from "@/lib/assets";

/** One room's label in a zone-override picker's candidate list: name plus
 *  ancestor path, so same-named rooms in different areas stay distinguishable.
 *  Shared by the add and copy pickers, whose surrounding Popover+Command
 *  shells otherwise stay separate (single-select-commits vs. multi-select-
 *  then-confirm), matching this codebase's existing pattern of not unifying
 *  near-identical pickers ahead of AGR-922. */
export const ZoneOverrideRoomOption: FC<{
  asset: Asset;
  assetsById: Record<string, Asset>;
}> = ({ asset, assetsById }) => (
  <span className="flex items-baseline gap-2">
    <span>{asset.name}</span>
    <span className="truncate text-xs text-muted-foreground">
      {ancestorPathOf(asset, assetsById)}
    </span>
  </span>
);
