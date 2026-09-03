import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Device } from "@gridone/sdk";
import type { DevicesFilter } from "@/lib/devices";
import { AttributeCoverageSelect } from "./AttributeCoverageSelect";
import { DevicesFilterTabs, type TargetPickerMode } from "./DevicesFilterTabs";
import { useSkippedDeviceCount } from "./useAttributeCoverage";

/** The persisted target shape: a device set (explicit ids, or type/tag
 *  criteria) plus the attribute addressed on it. */
export type AttributeTarget = {
  devices: {
    ids?: string[];
    types?: string[];
    tags?: { [key: string]: string[] };
  };
  attribute?: string;
};

type AttributeTargetPickerProps = {
  value: AttributeTarget;
  onChange: (value: AttributeTarget) => void;
  writableOnly?: boolean;
  devices: Device[];
};

/** One-shot picker for an ``{devices, attribute}`` target: a device set via
 *  DevicesFilterTabs, then an attribute over that set with union-with-coverage
 *  semantics via AttributeCoverageSelect. */
export function AttributeTargetPicker({
  value,
  onChange,
  writableOnly,
  devices,
}: AttributeTargetPickerProps) {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState<TargetPickerMode>(
    value.devices.types?.length || Object.keys(value.devices.tags ?? {}).length
      ? "filters"
      : "devices",
  );

  const coverageFilter: DevicesFilter =
    mode === "filters"
      ? { types: value.devices.types, tags: value.devices.tags }
      : { ids: value.devices.ids };

  // Same filter/query key as AttributeCoverageSelect below — React Query
  // dedupes the request, this just reads the cached result to size the
  // "devices skipped" warning for the chosen attribute.
  const { skipped, totalDevices } = useSkippedDeviceCount(
    coverageFilter,
    value.attribute,
  );

  return (
    <div className="space-y-4">
      <DevicesFilterTabs
        devices={devices}
        mode={mode}
        onModeChange={setMode}
        deviceIds={value.devices.ids ?? []}
        onDeviceIdsChange={(ids) => onChange({ ...value, devices: { ids } })}
        typesFilter={value.devices.types}
        onTypesFilterChange={(types) =>
          onChange({
            ...value,
            devices: { types, tags: value.devices.tags },
          })
        }
        tagsFilter={value.devices.tags}
        onTagsFilterChange={(tags) =>
          onChange({
            ...value,
            devices: { types: value.devices.types, tags },
          })
        }
      />
      <AttributeCoverageSelect
        filter={coverageFilter}
        value={value.attribute}
        writableOnly={writableOnly}
        onChange={(attribute) => onChange({ ...value, attribute })}
      />
      {skipped > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-500">
          {t("pickers.attribute.skippedWarning", {
            count: skipped,
            total: totalDevices,
          })}
        </p>
      )}
    </div>
  );
}
