import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useController, type Control } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Asset, Device } from "@gridone/sdk";
import type { AssetTreeNode } from "@/lib/assets";
import { DevicesFilterTabs } from "@/components/forms/targetPicker";
import { resolveAssetSubtreeDeviceIds } from "./resolvers";
import type { TargetMode } from "./types";
import type { WizardFormValues } from "./types";

const ALL = "__all__";

type TargetStepProps = {
  control: Control<WizardFormValues>;
  devices: Device[];
  assetTree: AssetTreeNode[];
  assetsList: Asset[];
};

/** Thin wrapper mapping the wizard's form state onto the shared
 *  DevicesFilterTabs. The asset controls stay wizard-specific and pass
 *  through the extra-filter slots: a display-only narrowing select in
 *  devices mode, and the persisted ``asset_id`` criterion in filters mode. */
export function TargetStep({
  control,
  devices,
  assetTree,
  assetsList,
}: TargetStepProps) {
  const modeCtl = useController({ control, name: "targetMode" });
  const idsCtl = useController({ control, name: "deviceIds" });
  const filterCtl = useController({ control, name: "targetFilter" });

  const mode = (modeCtl.field.value ?? "devices") as TargetMode;
  const targetFilter = filterCtl.field.value ?? {};

  // Devices mode: local display filter narrowing the table to an asset's
  // subtree — it does not change the selection.
  const [assetFilter, setAssetFilter] = useState<string | null>(null);
  const assetSubtreeIds = useMemo(() => {
    if (!assetFilter) return null;
    return new Set(resolveAssetSubtreeDeviceIds(assetTree, assetFilter));
  }, [assetTree, assetFilter]);

  const assetId = targetFilter.assetId;

  return (
    <DevicesFilterTabs
      devices={devices}
      mode={mode}
      onModeChange={modeCtl.field.onChange}
      deviceIds={idsCtl.field.value ?? []}
      onDeviceIdsChange={idsCtl.field.onChange}
      typesFilter={targetFilter.types}
      onTypesFilterChange={(types) =>
        filterCtl.field.onChange({ ...targetFilter, types })
      }
      extraFilters={
        <AssetSelect
          value={assetId ?? null}
          onChange={(v) =>
            filterCtl.field.onChange({
              ...targetFilter,
              assetId: v ?? undefined,
            })
          }
          assetsList={assetsList}
          className="w-[240px]"
        />
      }
      extraDeviceFilter={
        assetId ? (d) => d.tags?.["asset_id"] === assetId : undefined
      }
      pickerExtraFilters={
        <AssetSelect
          value={assetFilter}
          onChange={setAssetFilter}
          assetsList={assetsList}
          className="w-[220px]"
          highlightActive
        />
      }
      pickerExtraDeviceFilter={
        assetSubtreeIds ? (d) => assetSubtreeIds.has(d.id) : undefined
      }
    />
  );
}

type AssetSelectProps = {
  value: string | null;
  onChange: (assetId: string | null) => void;
  assetsList: Asset[];
  className: string;
  highlightActive?: boolean;
};

function AssetSelect({
  value,
  onChange,
  assetsList,
  className,
  highlightActive,
}: AssetSelectProps) {
  const { t } = useTranslation("devices");
  const activeTrigger = "border-primary text-primary ring-1 ring-primary/30";
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? null : v)}
    >
      <SelectTrigger
        className={cn(className, highlightActive && value && activeTrigger)}
      >
        <SelectValue placeholder={t("commands.new.allAssets")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{t("commands.new.allAssets")}</SelectItem>
        {assetsList.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
