import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Controller, type Control } from "react-hook-form";
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
import type { Asset, AssetTreeNode } from "@/api/assets";
import { DeviceType, type Device } from "@/api/devices";
import { DevicePickerTable } from "./DevicePickerTable";
import {
  resolveAssetSubtreeDeviceIds,
  resolveTargetFilter,
  type TargetMode,
  type WizardFormValues,
} from "./types";

const ALL = "__all__";

type TargetStepProps = {
  control: Control<WizardFormValues>;
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  defaultAssetId?: string;
  /** Disable the filter-mode tab — used when the wizard is scoped to a
   *  single device, where a filter-based target would be ambiguous. */
  lockMode?: TargetMode;
};

export function TargetStep({
  control,
  devices,
  assetTree,
  assetsList,
  defaultAssetId,
  lockMode,
}: TargetStepProps) {
  return (
    <Controller
      control={control}
      name="targetMode"
      render={({ field: modeField }) => {
        const mode = (lockMode ?? modeField.value ?? "devices") as TargetMode;
        return (
          <Tabs
            value={mode}
            onValueChange={(v) => !lockMode && modeField.onChange(v)}
          >
            {!lockMode && (
              <TabsList className="mb-4">
                <ModeTrigger mode="devices" />
                <ModeTrigger mode="filters" />
              </TabsList>
            )}
            <TabsContent value="devices" className="mt-0">
              <DevicesModeBody
                control={control}
                devices={devices}
                assetTree={assetTree}
                assetsList={assetsList}
                defaultAssetId={defaultAssetId}
              />
            </TabsContent>
            <TabsContent value="filters" className="mt-0">
              <FiltersModeBody
                control={control}
                devices={devices}
                assetsList={assetsList}
              />
            </TabsContent>
          </Tabs>
        );
      }}
    />
  );
}

function ModeTrigger({ mode }: { mode: TargetMode }) {
  const { t } = useTranslation("devices");
  return (
    <TabsTrigger value={mode}>
      {t(`commands.new.targetMode.${mode}`)}
    </TabsTrigger>
  );
}

// ---------------------------------------------------------------------------
// Devices mode — explicit picker, preserved from the original wizard.
// ---------------------------------------------------------------------------

type DevicesModeBodyProps = {
  control: Control<WizardFormValues>;
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  defaultAssetId?: string;
};

function DevicesModeBody({
  control,
  devices,
  assetTree,
  assetsList,
  defaultAssetId,
}: DevicesModeBodyProps) {
  const { t } = useTranslation("devices");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [assetFilter, setAssetFilter] = useState<string | null>(
    defaultAssetId ?? null,
  );

  const deviceTypes = useMemo(() => {
    const types = new Set<string>();
    devices.forEach((d) => {
      if (d.type) types.add(d.type);
    });
    return Array.from(types).sort();
  }, [devices]);

  const assetSubtreeIds = useMemo(() => {
    if (!assetFilter) return null;
    return new Set(resolveAssetSubtreeDeviceIds(assetTree, assetFilter));
  }, [assetTree, assetFilter]);

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
      if (assetSubtreeIds && !assetSubtreeIds.has(d.id)) return false;
      return true;
    });
  }, [devices, search, typeFilter, assetSubtreeIds]);

  return (
    <Controller
      control={control}
      name="deviceIds"
      render={({ field }) => {
        const selectedIds = field.value ?? [];
        const activeTrigger =
          "border-primary text-primary ring-1 ring-primary/30";

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
                  <SelectItem value={ALL}>
                    {t("commands.new.allTypes")}
                  </SelectItem>
                  {deviceTypes.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      <DeviceTypeChip type={dt as DeviceType} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={assetFilter ?? ALL}
                onValueChange={(v) => setAssetFilter(v === ALL ? null : v)}
              >
                <SelectTrigger
                  className={cn("w-[220px]", assetFilter && activeTrigger)}
                >
                  <SelectValue placeholder={t("commands.new.allAssets")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>
                    {t("commands.new.allAssets")}
                  </SelectItem>
                  {assetsList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              onChange={field.onChange}
            />
          </div>
        );
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Filters mode — asset_id + types, with a read-only preview. Matches the
// backend target's re-resolve-at-dispatch semantics for saved templates.
// ---------------------------------------------------------------------------

type FiltersModeBodyProps = {
  control: Control<WizardFormValues>;
  devices: Device[];
  assetsList: Asset[];
};

function FiltersModeBody({
  control,
  devices,
  assetsList,
}: FiltersModeBodyProps) {
  const { t } = useTranslation("devices");

  const deviceTypes = useMemo(() => {
    const types = new Set<string>();
    devices.forEach((d) => {
      if (d.type) types.add(d.type);
    });
    return Array.from(types).sort();
  }, [devices]);

  return (
    <Controller
      control={control}
      name="targetFilter"
      render={({ field }) => {
        const filter = field.value ?? {};
        const resolved = resolveTargetFilter(devices, filter);
        const selectedTypes = new Set(filter.types ?? []);

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={filter.assetId ?? ALL}
                onValueChange={(v) =>
                  field.onChange({
                    ...filter,
                    assetId: v === ALL ? undefined : v,
                  })
                }
              >
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder={t("commands.new.allAssets")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>
                    {t("commands.new.allAssets")}
                  </SelectItem>
                  {assetsList.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-wrap items-center gap-2">
                {deviceTypes.map((dt) => {
                  const isOn = selectedTypes.has(dt);
                  return (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedTypes);
                        if (isOn) next.delete(dt);
                        else next.add(dt);
                        field.onChange({
                          ...filter,
                          types: next.size > 0 ? Array.from(next) : undefined,
                        });
                      }}
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
                    onClick={() =>
                      field.onChange({ ...filter, types: undefined })
                    }
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
                {t("commands.new.summary.deviceCount", {
                  count: resolved.length,
                })}
              </Badge>
              <span className="text-xs">
                {t("commands.new.filterPreviewHint")}
              </span>
            </div>

            <FilterPreviewTable devices={resolved} />
          </div>
        );
      }}
    />
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
