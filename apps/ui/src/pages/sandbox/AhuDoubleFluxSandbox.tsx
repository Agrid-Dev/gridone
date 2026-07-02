import { useState } from "react";
import { toast } from "sonner";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Switch } from "@/components/ui";
import { Label } from "@/components/ui/label";
import {
  AhuDoubleFluxSynoptic,
  type AhuDoubleFluxValues,
  type AhuSetpointKey,
} from "../devices/standard-devices/ahu-double-flux";

const HEATING_UNIT: AhuDoubleFluxValues = {
  supplyAirTemperature: 21.4,
  supplyAirTemperatureSetpoint: 21,
  supplyFanSpeed: 55,
  extractAirTemperature: 22.3,
  extractFanSpeed: 70,
  onoffState: true,
  hvacMode: "heat",
  supplyAirPressure: 79,
  supplyAirPressureSetpoint: 80,
  extractAirPressure: 82,
  extractAirPressureSetpoint: 80,
  outdoorAirTemperature: 8.2,
  exhaustAirTemperature: 12.4,
  heatingValve: 80,
  coolingValve: 0,
  exchangerUtilization: 64,
};

// No heating coil on this unit — the glyph must not render.
const COOLING_UNIT: AhuDoubleFluxValues = {
  supplyAirTemperature: 16.2,
  supplyAirTemperatureSetpoint: 16,
  supplyFanSpeed: 80,
  extractAirTemperature: 25.1,
  extractFanSpeed: 75,
  onoffState: true,
  hvacMode: "cool",
  outdoorAirTemperature: 29.8,
  exhaustAirTemperature: 27.5,
  coolingValve: 65,
  exchangerUtilization: 12,
};

function SandboxUnit({
  title,
  initial,
}: {
  title: string;
  initial: AhuDoubleFluxValues;
}) {
  const [values, setValues] = useState<AhuDoubleFluxValues>(initial);
  const running = values.onoffState ?? false;

  const handleSetpointSave = (key: AhuSetpointKey, value: number) => {
    setValues((current) => ({ ...current, [key]: value }));
    toast.success(`${key} → ${value}`);
  };

  const toggleRunning = (on: boolean) => {
    setValues((current) => ({
      ...current,
      onoffState: on,
      supplyFanSpeed: on ? initial.supplyFanSpeed : 0,
      extractFanSpeed: on ? initial.extractFanSpeed : 0,
      exchangerUtilization: on ? initial.exchangerUtilization : 0,
    }));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor={`running-${title}`}>Running</Label>
          <Switch
            id={`running-${title}`}
            checked={running}
            onCheckedChange={toggleRunning}
          />
        </div>
      </div>
      <AhuDoubleFluxSynoptic
        values={values}
        writableSetpoints={[
          "supplyAirTemperatureSetpoint",
          "supplyAirPressureSetpoint",
        ]}
        onSetpointSave={handleSetpointSave}
      />
    </div>
  );
}

/** Dev-only page (AGR-865): the double-flux AHU synoptic fed with
 *  hard-coded data, until it is plugged into a live device. */
export default function AhuDoubleFluxSandbox() {
  return (
    <section className="space-y-6">
      <ResourceHeader
        title="Double-flux AHU synoptic"
        caption="Sandbox — hard-coded device data (AGR-865)"
      />
      <SandboxUnit
        title="CTA 01 — heating (both coils, pressure sensors)"
        initial={HEATING_UNIT}
      />
      <SandboxUnit
        title="CTA 02 — cooling (no heating coil, no pressure sensors)"
        initial={COOLING_UNIT}
      />
    </section>
  );
}
