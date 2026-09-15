import { useMemo } from "react";
import type { Device } from "@gridone/sdk";
import type { AssetTreeNode } from "@/lib/assets";
import { isAttributeWritable, type DevicesFilter } from "@/lib/devices";
import {
  deviceMatchesFilter,
  resolveAssetSubtreeIds,
  resolveFilter,
} from "./resolvers";
import type { CommandUrlState } from "./useCommandUrlState";

type Args = {
  devices: Device[];
  assetTree: AssetTreeNode[];
  url: CommandUrlState;
  deviceId?: string;
};

export type CommandSelection = {
  /** Devices the scope alone allows — the pool the picker offers. Unlike a
   *  target, an empty scope filter means "no narrowing", not "nothing". */
  scopeDevices: Device[];
  /** The filters-mode criteria (scope plus types) resolved locally. The single
   *  source for both the filters-mode table and, in that mode, the dispatched
   *  selection — so what the user sees and what goes out cannot be derived
   *  apart. */
  matched: Device[];
  selected: Device[];
  /** Selected devices that can actually receive the attribute. */
  eligible: Device[];
  /** Selected devices that cannot, kept visible instead of dropped. */
  excluded: Device[];
  /** What goes on the wire: frozen ids in devices mode, criteria in filters. */
  target: DevicesFilter;
};

/** Derive every device set the page shows from the URL state and the live
 *  device list. */
export function useCommandSelection({
  devices,
  assetTree,
  url,
  deviceId,
}: Args): CommandSelection {
  const { scope, mode, attribute, types, ids, ready } = url;
  const scopeFilter = useMemo<DevicesFilter>(
    () =>
      deviceId
        ? { ids: [deviceId] }
        : mode === "devices" || scope === "all"
          ? {}
          : { tags: { asset_id: resolveAssetSubtreeIds(assetTree, scope) } },
    [deviceId, mode, scope, assetTree],
  );
  const filtersTarget: DevicesFilter = {
    ...scopeFilter,
    ...(types.length ? { types } : {}),
  };
  const scopeDevices = devices.filter(
    (item) => ready && deviceMatchesFilter(item, scopeFilter),
  );
  const matched = ready ? resolveFilter(devices, filtersTarget) : [];
  const selected = deviceId
    ? scopeDevices
    : mode === "filters"
      ? matched
      : scopeDevices.filter((item) => ids.includes(item.id));
  const eligible = selected.filter((item) =>
    isAttributeWritable(item, attribute),
  );
  return {
    scopeDevices,
    matched,
    selected,
    eligible,
    excluded: attribute
      ? selected.filter((item) => !isAttributeWritable(item, attribute))
      : [],
    target:
      mode === "devices"
        ? { ids: selected.map((item) => item.id) }
        : filtersTarget,
  };
}
