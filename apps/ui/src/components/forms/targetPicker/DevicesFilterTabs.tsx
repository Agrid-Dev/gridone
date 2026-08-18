import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { cn } from "@/lib/utils";
import type { Device } from "@gridone/sdk";
import type { DeviceType } from "@/lib/devices";
import { DevicePickerTable } from "./DevicePickerTable";

/** How the user describes the device set. "devices" freezes the selection to
 *  an explicit id list; "filters" captures criteria (types, asset…) that are
 *  re-resolved against the live device list. */
export type TargetPickerMode = "devices" | "filters";

type TagsFilter = { [key: string]: string[] };

type DevicesFilterTabsProps = {
  devices: Device[];
  mode: TargetPickerMode;
  onModeChange: (mode: TargetPickerMode) => void;
  deviceIds: string[];
  onDeviceIdsChange: (ids: string[]) => void;
  typesFilter?: string[];
  onTypesFilterChange: (types: string[] | undefined) => void;
  /** Tag criteria for filters mode. Omit ``onTagsFilterChange`` (grouped
   *  commands, not yet extended to tags) to hide the tag chips entirely
   *  rather than render controls that don't do anything. */
  tagsFilter?: TagsFilter;
  onTagsFilterChange?: (tags: TagsFilter | undefined) => void;
  /** Caller-specific controls rendered in filters mode (e.g. an asset
   *  select). Paired with ``extraDeviceFilter`` for the preview. */
  extraFilters?: ReactNode;
  /** Extra constraint the caller applies to the filters-mode matched list
   *  (e.g. asset membership). Its presence also marks the filter as
   *  non-empty, so a match-all preview only appears when intended. */
  extraDeviceFilter?: (device: Device) => boolean;
  /** Caller-specific narrowing controls rendered in the explicit-devices
   *  toolbar (display-only; they do not change the selection). */
  pickerExtraFilters?: ReactNode;
  /** Extra narrowing applied to the explicit-devices table rows. */
  pickerExtraDeviceFilter?: (device: Device) => boolean;
};

/** Two-tab device-set selection: explicit devices (search + type filter +
 *  multi-select table) or filters (type chips + live preview of matches). */
export function DevicesFilterTabs({
  devices,
  mode,
  onModeChange,
  deviceIds,
  onDeviceIdsChange,
  typesFilter,
  onTypesFilterChange,
  tagsFilter,
  onTagsFilterChange,
  extraFilters,
  extraDeviceFilter,
  pickerExtraFilters,
  pickerExtraDeviceFilter,
}: DevicesFilterTabsProps) {
  return (
    <Tabs
      value={mode}
      onValueChange={(v) => onModeChange(v as TargetPickerMode)}
    >
      <TabsList className="mb-4">
        <ModeTrigger mode="devices" />
        <ModeTrigger mode="filters" />
      </TabsList>
      <TabsContent value="devices" className="mt-0">
        <DevicesModeBody
          devices={devices}
          selectedIds={deviceIds}
          onChange={onDeviceIdsChange}
          extraFilters={pickerExtraFilters}
          extraDeviceFilter={pickerExtraDeviceFilter}
        />
      </TabsContent>
      <TabsContent value="filters" className="mt-0">
        <FiltersModeBody
          devices={devices}
          typesFilter={typesFilter}
          onTypesFilterChange={onTypesFilterChange}
          tagsFilter={tagsFilter}
          onTagsFilterChange={onTagsFilterChange}
          extraFilters={extraFilters}
          extraDeviceFilter={extraDeviceFilter}
        />
      </TabsContent>
    </Tabs>
  );
}

function ModeTrigger({ mode }: { mode: TargetPickerMode }) {
  const { t } = useTranslation("devices");
  return (
    <TabsTrigger value={mode}>
      {t(`commands.new.targetMode.${mode}`)}
    </TabsTrigger>
  );
}

function deviceTypesOf(devices: Device[]): string[] {
  const types = new Set<string>();
  devices.forEach((d) => {
    if (d.type) types.add(d.type);
  });
  return Array.from(types).sort();
}

/** Tag keys observed across *devices*, each with the distinct values seen for
 *  it — the vocabulary offered as filter chips. */
function deviceTagsOf(devices: Device[]): [string, string[]][] {
  const byKey = new Map<string, Set<string>>();
  devices.forEach((d) => {
    Object.entries(d.tags ?? {}).forEach(([key, value]) => {
      if (!byKey.has(key)) byKey.set(key, new Set());
      byKey.get(key)!.add(value);
    });
  });
  return Array.from(byKey.entries())
    .map(([key, values]): [string, string[]] => [
      key,
      Array.from(values).sort(),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

/** True when *device* carries, for every key in *tagsFilter*, one of the
 *  accepted values — intersection across keys, union of values within a key. */
function matchesTags(device: Device, tagsFilter: TagsFilter): boolean {
  return Object.entries(tagsFilter).every(([key, values]) => {
    const tagValue = device.tags?.[key];
    return tagValue !== undefined && values.includes(tagValue);
  });
}

// ---------------------------------------------------------------------------
// Devices mode — explicit multi-select over the device table.
// ---------------------------------------------------------------------------

type DevicesModeBodyProps = {
  devices: Device[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  extraFilters?: ReactNode;
  extraDeviceFilter?: (device: Device) => boolean;
};

function DevicesModeBody({
  devices,
  selectedIds,
  onChange,
  extraFilters,
  extraDeviceFilter,
}: DevicesModeBodyProps) {
  const { t } = useTranslation("devices");

  // Search only — no type narrowing here: a type criterion belongs to the
  // "by filters" mode, and offering it on both tabs read as two competing
  // targets.
  const [search, setSearch] = useState("");

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (q) {
        if (
          !d.name.toLowerCase().includes(q) &&
          !d.id.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (extraDeviceFilter && !extraDeviceFilter(d)) return false;
      return true;
    });
  }, [devices, search, extraDeviceFilter]);

  const activeTrigger = "border-primary text-primary ring-1 ring-primary/30";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("commands.new.searchDevicesPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn("pl-8", search && activeTrigger)}
          />
        </div>
        {extraFilters}
      </div>

      <p className="text-sm text-muted-foreground">
        {t("commands.new.selectionCount", {
          count: selectedIds.length,
          total: devices.length,
        })}
      </p>

      <DevicePickerTable
        devices={filteredDevices}
        selectedIds={selectedIds}
        onChange={onChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filters mode — type chips + caller-supplied criteria, with a read-only
// preview matching the backend's re-resolve-at-dispatch semantics.
// ---------------------------------------------------------------------------

type FiltersModeBodyProps = {
  devices: Device[];
  typesFilter?: string[];
  onTypesFilterChange: (types: string[] | undefined) => void;
  tagsFilter?: TagsFilter;
  onTagsFilterChange?: (tags: TagsFilter | undefined) => void;
  extraFilters?: ReactNode;
  extraDeviceFilter?: (device: Device) => boolean;
};

function FiltersModeBody({
  devices,
  typesFilter,
  onTypesFilterChange,
  tagsFilter,
  onTagsFilterChange,
  extraFilters,
  extraDeviceFilter,
}: FiltersModeBodyProps) {
  const { t } = useTranslation(["devices", "common"]);

  const deviceTypes = useMemo(() => deviceTypesOf(devices), [devices]);
  const deviceTags = useMemo(
    () => (onTagsFilterChange ? deviceTagsOf(devices) : []),
    [devices, onTagsFilterChange],
  );
  const selectedTypes = useMemo(
    () => new Set(typesFilter ?? []),
    [typesFilter],
  );
  const hasTagsFilter = Object.keys(tagsFilter ?? {}).length > 0;

  // An empty filter matches nothing — "everything" is never an intentional
  // target. The caller's extraDeviceFilter counts as a set criterion.
  const resolved = useMemo(() => {
    if (selectedTypes.size === 0 && !hasTagsFilter && !extraDeviceFilter) {
      return [];
    }
    return devices.filter((d) => {
      if (selectedTypes.size > 0 && (!d.type || !selectedTypes.has(d.type))) {
        return false;
      }
      if (tagsFilter && !matchesTags(d, tagsFilter)) return false;
      if (extraDeviceFilter && !extraDeviceFilter(d)) return false;
      return true;
    });
  }, [devices, selectedTypes, tagsFilter, hasTagsFilter, extraDeviceFilter]);

  const toggleType = (dt: string) => {
    const next = new Set(selectedTypes);
    if (next.has(dt)) next.delete(dt);
    else next.add(dt);
    onTypesFilterChange(next.size > 0 ? Array.from(next) : undefined);
  };

  const toggleTag = (key: string, value: string) => {
    if (!onTagsFilterChange) return;
    const current = new Set(tagsFilter?.[key] ?? []);
    if (current.has(value)) current.delete(value);
    else current.add(value);

    const next = { ...tagsFilter };
    if (current.size > 0) next[key] = Array.from(current);
    else delete next[key];

    onTagsFilterChange(Object.keys(next).length > 0 ? next : undefined);
  };

  const clearAll = () => {
    onTypesFilterChange(undefined);
    onTagsFilterChange?.(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {extraFilters}

        <div className="flex flex-wrap items-center gap-2">
          {deviceTypes.map((dt) => {
            const isOn = selectedTypes.has(dt);
            return (
              <button
                key={dt}
                type="button"
                onClick={() => toggleType(dt)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  isOn
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                <DeviceTypeChip type={dt as DeviceType} />
              </button>
            );
          })}
        </div>
      </div>

      {deviceTags.length > 0 && (
        <div className="flex flex-wrap items-start gap-4">
          {deviceTags.map(([key, values]) => (
            <div key={key} className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {key}
              </span>
              {values.map((v) => {
                const isOn = tagsFilter?.[key]?.includes(v) ?? false;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleTag(key, v)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs transition-colors",
                      isOn
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {(selectedTypes.size > 0 || hasTagsFilter) && (
        <button
          type="button"
          onClick={clearAll}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          {t("common:common.clear")}
        </button>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">
          {t("commands.new.summary.deviceCount", { count: resolved.length })}
        </Badge>
        <span className="text-xs">{t("commands.new.filterPreviewHint")}</span>
      </div>

      <FilterPreviewTable devices={resolved} />
    </div>
  );
}

function FilterPreviewTable({ devices }: { devices: Device[] }) {
  const { t } = useTranslation("devices");
  if (devices.length === 0) {
    return (
      <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
        {t("commands.new.noDevicesMatch")}
      </p>
    );
  }
  return (
    <div className="max-h-72 overflow-y-auto rounded-md border">
      <ul className="divide-y">
        {devices.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between px-3 py-2 text-sm"
          >
            <span className="font-medium">{d.name || d.id}</span>
            {d.type && <DeviceTypeChip type={d.type} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
