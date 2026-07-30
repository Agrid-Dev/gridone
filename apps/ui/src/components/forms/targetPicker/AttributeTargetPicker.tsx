import { useState } from "react";
import type { Device } from "@gridone/sdk";
import type { DevicesFilter } from "@/lib/devices";
import { AttributeCoverageSelect } from "./AttributeCoverageSelect";
import { DevicesFilterTabs, type TargetPickerMode } from "./DevicesFilterTabs";

/** The persisted target shape: a device set (explicit ids or type criteria)
 *  plus the attribute addressed on it. */
export type AttributeTarget = {
  devices: { ids?: string[]; types?: string[] };
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
  const [mode, setMode] = useState<TargetPickerMode>(
    value.devices.types?.length ? "filters" : "devices",
  );

  const coverageFilter: DevicesFilter =
    mode === "filters"
      ? { types: value.devices.types }
      : { ids: value.devices.ids };

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
          onChange({ ...value, devices: { types } })
        }
      />
      <AttributeCoverageSelect
        filter={coverageFilter}
        value={value.attribute}
        writableOnly={writableOnly}
        onChange={(attribute) => onChange({ ...value, attribute })}
      />
    </div>
  );
}
