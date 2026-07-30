import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { cn } from "@/lib/utils";
import type { Device } from "@gridone/sdk";
import type { DeviceType } from "@/lib/devices";
import { DevicePickerTable } from "./DevicePickerTable";

const ALL = "__all__";

/** How the user describes the device set. "devices" freezes the selection to
 *  an explicit id list; "filters" captures criteria (types, asset…) that are
 *  re-resolved against the live device list. */
export type TargetPickerMode = "devices" | "filters";

type DevicesFilterTabsProps = {
  devices: Device[];
  mode: TargetPickerMode;
  onModeChange: (mode: TargetPickerMode) => void;
  deviceIds: string[];
  onDeviceIdsChange: (ids: string[]) => void;
  typesFilter?: string[];
  onTypesFilterChange: (types: string[] | undefined) => void;
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

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const deviceTypes = useMemo(() => deviceTypesOf(devices), [devices]);

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
      if (typeFilter && d.type !== typeFilter) return false;
      if (extraDeviceFilter && !extraDeviceFilter(d)) return false;
      return true;
    });
  }, [devices, search, typeFilter, extraDeviceFilter]);

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
        <Select
          value={typeFilter ?? ALL}
          onValueChange={(v) => setTypeFilter(v === ALL ? null : v)}
        >
          <SelectTrigger
            className={cn("w-[180px]", typeFilter && activeTrigger)}
          >
            <SelectValue placeholder={t("commands.new.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("commands.new.allTypes")}</SelectItem>
            {deviceTypes.map((dt) => (
              <SelectItem key={dt} value={dt}>
                <DeviceTypeChip type={dt as DeviceType} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
  extraFilters?: ReactNode;
  extraDeviceFilter?: (device: Device) => boolean;
};

function FiltersModeBody({
  devices,
  typesFilter,
  onTypesFilterChange,
  extraFilters,
  extraDeviceFilter,
}: FiltersModeBodyProps) {
  const { t } = useTranslation(["devices", "common"]);

  const deviceTypes = useMemo(() => deviceTypesOf(devices), [devices]);
  const selectedTypes = useMemo(
    () => new Set(typesFilter ?? []),
    [typesFilter],
  );

  // An empty filter matches nothing — "everything" is never an intentional
  // target. The caller's extraDeviceFilter counts as a set criterion.
  const resolved = useMemo(() => {
    if (selectedTypes.size === 0 && !extraDeviceFilter) return [];
    return devices.filter((d) => {
      if (selectedTypes.size > 0 && (!d.type || !selectedTypes.has(d.type))) {
        return false;
      }
      if (extraDeviceFilter && !extraDeviceFilter(d)) return false;
      return true;
    });
  }, [devices, selectedTypes, extraDeviceFilter]);

  const toggleType = (dt: string) => {
    const next = new Set(selectedTypes);
    if (next.has(dt)) next.delete(dt);
    else next.add(dt);
    onTypesFilterChange(next.size > 0 ? Array.from(next) : undefined);
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
          {selectedTypes.size > 0 && (
            <button
              type="button"
              onClick={() => onTypesFilterChange(undefined)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              {t("common:common.clear")}
            </button>
          )}
        </div>
      </div>

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
