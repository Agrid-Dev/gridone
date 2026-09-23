import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import type { Asset, AttributeCoverage, Device } from "@gridone/sdk";
import type { AssetTreeNode } from "@/lib/assets";
import { useAttributeCoverage } from "@/components/forms/targetPicker";
import { currentValueFor } from "./resolvers";
import {
  commandValueSchema,
  valueMatchesType,
  type CommandValues,
} from "./groupedCommand";
import { useCommandUrlState, type CommandUrlState } from "./useCommandUrlState";
import {
  useCommandSelection,
  type CommandSelection,
} from "./useCommandSelection";
import type { CommandPayload } from "./groupedCommand";

type Args = {
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  deviceId?: string;
  assetId?: string;
  loading: boolean;
};

export type GroupedCommand = {
  url: CommandUrlState;
  selection: CommandSelection;
  /** Coverage of the whole selection for the chosen attribute. Its four
   *  presentation fields already unify over the writable devices server-side,
   *  so one query answers both "how many" and "how to render". */
  coverage: AttributeCoverage | undefined;
  /** The selection as an id filter — what the attribute select covers. */
  selectedFilter: { ids: string[] };
  form: ReturnType<typeof useForm<CommandValues>>;
  payload: CommandPayload;
  canSubmit: boolean;
  isLoading: boolean;
  error: Error | null;
  chooseAttribute: (attribute: string) => void;
  chooseIds: (ids: string[]) => void;
  chooseScope: (scope: string) => void;
  chooseMode: (mode: CommandUrlState["mode"]) => void;
  chooseTypes: (types: string[] | undefined) => void;
};

/** Compose the URL state, the device sets it resolves to, and the coverage of
 *  the chosen attribute into the one command the page is preparing. */
export function useGroupedCommand({
  devices,
  assetTree,
  assetsList,
  deviceId,
  assetId,
  loading,
}: Args): GroupedCommand {
  const url = useCommandUrlState({
    devices,
    assetsList,
    deviceId,
    assetId,
    loading,
  });
  const selection = useCommandSelection({ devices, assetTree, url, deviceId });
  const { attribute, ready, update } = url;
  const { selected, eligible } = selection;
  const selectedFilter = { ids: selected.map((item) => item.id) };
  const coverageQuery = useAttributeCoverage(selectedFilter, {
    enabled: ready && selected.length > 0,
  });
  const coverage = coverageQuery.coverage.find(
    (item) => item.attribute === attribute,
  );
  const form = useForm<z.infer<typeof commandValueSchema>>({
    resolver: zodResolver(commandValueSchema),
    values: { value: url.value },
    mode: "onChange",
  });

  // The URL holds the value the page shares and dispatches, so every control
  // of the form mirrors into it here rather than one by one. Only a real edit
  // writes back: `values:` re-hydrates the field one render after the URL
  // changes, so mirroring the watched value instead would write the previous
  // attribute's value over the new one. Continuous edit: replace, so a typed
  // value costs one "back", not one per keystroke.
  const write = useRef(update);
  write.current = update;
  useEffect(() => {
    const subscription = form.watch((values, { name, type }) => {
      if (name !== "value" || type !== "change") return;
      write.current({ value: JSON.stringify(values.value) ?? "" }, true);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Restore contextual links without inferring a target from the attribute.
  // An explicit empty value means deliberately blank.
  useEffect(() => {
    if (!ready || coverageQuery.isLoading || coverageQuery.error) return;
    const changes: Record<string, string | undefined> = {};
    if (!url.has("scope")) changes.scope = url.scope;
    if (!url.has("mode")) changes.mode = url.mode;
    if (attribute && coverage && !url.has("value"))
      changes.value =
        JSON.stringify(currentValueFor(selected, attribute)) ?? "";
    if (Object.keys(changes).length || url.has("step")) update(changes, true);
  }, [
    ready,
    coverageQuery.isLoading,
    coverageQuery.error,
    url.search,
    coverage,
  ]);

  return {
    url,
    selection,
    coverage,
    selectedFilter,
    form,
    payload: {
      target: selection.target,
      write: {
        attribute,
        value: url.value ?? "",
        data_type: coverage?.data_types[0] ?? "str",
      },
    },
    isLoading: loading || coverageQuery.isLoading,
    error: coverageQuery.error,
    canSubmit:
      ready &&
      !coverageQuery.isLoading &&
      !coverageQuery.error &&
      eligible.length > 0 &&
      !!coverage &&
      coverage.writable_count > 0 &&
      coverage.data_types.length === 1 &&
      valueMatchesType(url.value, coverage.data_types[0]),
    chooseAttribute: (next: string) =>
      update({
        attribute: next,
        value: JSON.stringify(currentValueFor(selected, next)) ?? "",
      }),
    chooseIds: (ids: string[]) =>
      update({
        ids: ids.join(","),
        mode: "devices",
        detached: url.mode === "filters" || url.detached ? "1" : undefined,
      }),
    chooseScope: (next: string) =>
      update({
        scope: next,
        attribute: undefined,
        value: undefined,
        ids: undefined,
        detached: undefined,
      }),
    chooseMode: (next: CommandUrlState["mode"]) =>
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
  };
}
