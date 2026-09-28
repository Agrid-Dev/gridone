import { useSearchParams } from "react-router";
import type { Asset, Device } from "@gridone/sdk";
import type { AttributeValue } from "@/lib/devices";
import type { TargetPickerMode } from "@/components/forms/targetPicker";
import { parseCommandValue } from "./groupedCommand";

type Args = {
  devices: Device[];
  assetsList: Asset[];
  canReadAssets: boolean;
  deviceId?: string;
  assetId?: string;
  loading: boolean;
};

export type CommandUrlState = {
  scope: string;
  mode: TargetPickerMode;
  attribute: string;
  types: string[];
  /** Ids explicitly frozen in the URL, in devices mode. */
  ids: string[];
  value: AttributeValue | undefined;
  /** The selection was detached from its filter by an explicit exception. */
  detached: boolean;
  /** The route pins the target: the picker gives way to a read-only list. */
  locked: boolean;
  scopeExists: boolean;
  /** Everything the URL references has loaded and exists. */
  ready: boolean;
  /** Is *key* written in the URL? An explicit empty value means deliberately
   *  blank, which is not the same as absent. */
  has: (key: string) => boolean;
  /** Serialized params — a stable dependency for effects watching the URL. */
  search: string;
  /** Write *changes* back to the URL. Discrete choices push a history entry;
   *  pass ``replace`` for continuous edits. */
  update: (
    changes: Record<string, string | undefined>,
    replace?: boolean,
  ) => void;
};

/** The URL owns the pending command, so it stays shareable and back/forward
 *  restores the exact selection. Discrete choices (target, attribute, scope,
 *  mode) are navigation entries; continuous edits replace, or typing `21.5`
 *  would cost four "back"s to undo and strand the browser's back button. */
export function useCommandUrlState({
  devices,
  assetsList,
  canReadAssets,
  deviceId,
  assetId,
  loading,
}: Args): CommandUrlState {
  const [params, setParams] = useSearchParams();
  const device = devices.find((item) => item.id === deviceId);
  // A device route pins its target by id; its asset is only display context.
  // Explicit asset scopes below still require the tree and never fall back to all.
  const scope =
    assetId ??
    (deviceId
      ? canReadAssets
        ? (device?.tags?.asset_id?.[0] ?? "all")
        : "all"
      : undefined) ??
    params.get("scope") ??
    "all";
  const scopeExists =
    scope === "all" || assetsList.some((asset) => asset.id === scope);
  const locked = !!deviceId || !!assetId;
  const mode: TargetPickerMode = deviceId
    ? "devices"
    : assetId
      ? "filters"
      : params.get("mode") === "filters"
        ? "filters"
        : "devices";

  function update(
    changes: Record<string, string | undefined>,
    replace = false,
  ) {
    const next = new URLSearchParams(params);
    next.delete("step");
    next.set("scope", scope);
    next.set("mode", mode);
    for (const [key, val] of Object.entries(changes)) {
      if (val === undefined) next.delete(key);
      else next.set(key, val);
    }
    setParams(next, { replace });
  }

  return {
    scope,
    mode,
    attribute: params.get("attribute") ?? "",
    types: locked ? [] : (params.get("types") ?? "").split(",").filter(Boolean),
    ids: (params.get("ids") ?? "").split(",").filter(Boolean),
    value: parseCommandValue(params.get("value")),
    detached: params.get("detached") === "1",
    locked,
    scopeExists,
    ready: !loading && scopeExists && (!deviceId || !!device),
    has: (key: string) => params.has(key),
    search: params.toString(),
    update,
  };
}
