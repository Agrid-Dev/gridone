import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { localize } from "@/lib/localizedText";
import { toLabel } from "@/lib/textFormat";
import type { CommandPreview } from "./useGroupedDispatch";
import { useSearchParams } from "react-router";
import type { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Asset, Device } from "@gridone/sdk";
import type { AssetTreeNode } from "@/lib/assets";
import {
  isAttributeWritable,
  type AttributeValue,
  type DevicesFilter,
} from "@/lib/devices";
import {
  useAttributeCoverage,
  type TargetPickerMode,
} from "@/components/forms/targetPicker";
import {
  currentValueFor,
  deviceMatchesFilter,
  resolveAssetSubtreeIds,
} from "./resolvers";
import {
  commandValueSchema,
  parseCommandValue,
  valueMatchesType,
} from "./groupedCommand";

type Args = {
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  deviceId?: string;
  assetId?: string;
  loading: boolean;
};

/** The URL owns the pending command. Edits are navigation entries so back/forward
 * restores the exact selection; polling never adds devices to an explicit list. */
export function useGroupedCommand({
  devices,
  assetTree,
  assetsList,
  deviceId,
  assetId,
  loading,
}: Args) {
  const { t, i18n } = useTranslation("devices");
  const [params, setParams] = useSearchParams();
  const device = devices.find((item) => item.id === deviceId);
  const scope =
    assetId ??
    (deviceId ? (device?.tags?.asset_id ?? "all") : undefined) ??
    params.get("scope") ??
    "all";
  const scopeExists =
    scope === "all" || assetsList.some((asset) => asset.id === scope);
  const ready = !loading && scopeExists && (!deviceId || !!device);
  const locked = !!deviceId || !!assetId;
  const mode: TargetPickerMode = deviceId
    ? "devices"
    : assetId
      ? "filters"
      : params.get("mode") === "filters"
        ? "filters"
        : "devices";
  const attribute = params.get("attribute") ?? "";
  const types = locked
    ? []
    : (params.get("types") ?? "").split(",").filter(Boolean);
  const scopeFilter = useMemo<DevicesFilter>(
    () =>
      deviceId
        ? { ids: [deviceId] }
        : mode === "devices" || scope === "all"
          ? {}
          : { tags: { asset_id: resolveAssetSubtreeIds(assetTree, scope) } },
    [deviceId, mode, scope, assetTree],
  );
  const scopeDevices = devices.filter(
    (item) => ready && deviceMatchesFilter(item, scopeFilter),
  );
  const hasFilters = scope !== "all" || types.length > 0;
  const matched = scopeDevices.filter(
    (item) =>
      hasFilters &&
      (types.length === 0 || (item.type && types.includes(item.type))),
  );
  const storedIds = (params.get("ids") ?? "").split(",").filter(Boolean);
  const selected = deviceId
    ? scopeDevices
    : mode === "filters"
      ? matched
      : scopeDevices.filter((item) => storedIds.includes(item.id));
  const eligible = selected.filter((item) =>
    isAttributeWritable(item, attribute),
  );
  const excluded = attribute
    ? selected.filter((item) => !isAttributeWritable(item, attribute))
    : [];
  const selectedFilter = { ids: selected.map((item) => item.id) };
  const coverageQuery = useAttributeCoverage(selectedFilter, {
    enabled: ready && selected.length > 0,
  });
  const row = coverageQuery.coverage.find(
    (item) => item.attribute === attribute,
  );
  const value = parseCommandValue(params.get("value"));
  const form = useForm<z.infer<typeof commandValueSchema>>({
    resolver: zodResolver(commandValueSchema),
    values: { value },
    mode: "onChange",
  });
  const selectionCoverage = useAttributeCoverage(
    { ids: eligible.map((item) => item.id) },
    {
      enabled: ready && eligible.length > 0,
    },
  );
  const presentation =
    selectionCoverage.coverage.find((item) => item.attribute === attribute) ??
    row;
  const target: DevicesFilter =
    mode === "devices"
      ? selectedFilter
      : {
          ...scopeFilter,
          ...(types.length ? { types } : {}),
        };

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

  // Restore contextual links without inferring a target from the attribute.
  // An explicit empty value means deliberately blank.
  useEffect(() => {
    if (!ready || coverageQuery.isLoading || coverageQuery.error) return;
    const changes: Record<string, string | undefined> = {};
    if (!params.has("scope")) changes.scope = scope;
    if (!params.has("mode")) changes.mode = mode;
    if (attribute && row && !params.has("value"))
      changes.value =
        JSON.stringify(currentValueFor(selected, attribute)) ?? "";
    if (Object.keys(changes).length || params.has("step"))
      update(changes, true);
  }, [
    ready,
    coverageQuery.isLoading,
    coverageQuery.error,
    params.toString(),
    row,
  ]);

  function chooseAttribute(next: string) {
    update({
      attribute: next,
      value: JSON.stringify(currentValueFor(selected, next)) ?? "",
    });
  }

  function chooseIds(ids: string[]) {
    update({
      ids: ids.join(","),
      mode: "devices",
      detached:
        mode === "filters" ? "1" : (params.get("detached") ?? undefined),
    });
  }

  const preview: CommandPreview = {
    devices: eligible,
    target,
    write: {
      attribute,
      value: value ?? "",
      data_type: row?.data_types[0] ?? "str",
    },
    scope:
      (mode === "devices" && !locked
        ? t("commands.grouped.selectedDevices")
        : assetsList.find((asset) => asset.id === scope)?.name) ??
      (scope === "all" ? t("commands.new.allAssets") : scope),
    label: row?.label ? localize(row.label, i18n.language) : toLabel(attribute),
    unit: presentation?.unit,
  };
  return {
    preview,
    form,
    scope,
    scopeExists,
    locked,
    mode,
    attribute,
    value,
    row,
    presentation,
    scopeFilter,
    selectedFilter,
    matchesScope: (item: Device) =>
      ready && deviceMatchesFilter(item, scopeFilter),
    scopeDevices,
    eligible,
    excluded,
    selected,
    types,
    target,
    isLoading:
      loading || coverageQuery.isLoading || selectionCoverage.isLoading,
    error: coverageQuery.error ?? selectionCoverage.error,
    detached: params.get("detached") === "1",
    canSubmit:
      ready &&
      !coverageQuery.isLoading &&
      !coverageQuery.error &&
      !selectionCoverage.isLoading &&
      !selectionCoverage.error &&
      eligible.length > 0 &&
      !!row &&
      row.writable_count > 0 &&
      row.data_types.length === 1 &&
      valueMatchesType(value, row.data_types[0]),
    chooseAttribute,
    chooseIds,
    chooseScope: (next: string) =>
      update({
        scope: next,
        attribute: undefined,
        value: undefined,
        ids: undefined,
        detached: undefined,
      }),
    chooseMode: (next: TargetPickerMode) =>
      update({
        mode: next,
        ids:
          next === "devices"
            ? selected.map((item) => item.id).join(",")
            : undefined,
        detached: undefined,
      }),
    chooseTypes: (next: string[] | undefined) =>
      update({ types: next?.join(",") }),
    changeValue: (next: AttributeValue | undefined) =>
      update({ value: JSON.stringify(next) ?? "" }),
  };
}
