import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Controller, type Control } from "react-hook-form";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeviceTypeChip } from "@/components/DeviceTypeChip";
import { cn } from "@/lib/utils";
import type { Asset, AssetTreeNode } from "@/api/assets";
import { DeviceType, type Device } from "@/api/devices";
import { DevicePickerTable } from "./DevicePickerTable";
import { resolveAssetSubtreeDeviceIds, type WizardFormValues } from "./types";

const ALL = "__all__";

type TargetStepProps = {
  control: Control<WizardFormValues>;
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
  defaultAssetId?: string;
};

export function TargetStep({
  control,
  devices,
  assetTree,
  assetsList,
  defaultAssetId,
}: TargetStepProps) {
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
