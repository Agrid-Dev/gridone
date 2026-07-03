import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Switch } from "@/components/ui";
import { Label } from "@/components/ui/label";
import {
  AhuDoubleFluxSynoptic,
  type AhuDoubleFluxValues,
  type AhuSetpointKey,
} from "../devices/standard-devices/ahu-double-flux";
import {
  AhuSingleFluxSynoptic,
  type AhuSingleFluxSetpointKey,
  type AhuSingleFluxValues,
} from "../devices/standard-devices/ahu-single-flux";
import {
  AirExtractorSynoptic,
  type AirExtractorValues,
} from "../devices/standard-devices/air-extractor";

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

// A typical unit: heating coil only, temperature setpoint only.
const SINGLE_FLUX_UNIT: AhuSingleFluxValues = {
  supplyAirTemperature: 15.9,
  supplyAirTemperatureSetpoint: 16,
  supplyFanSpeed: 45,
  onoffState: true,
  supplyAirPressure: 2,
  outdoorAirTemperature: 14.8,
  heatingValve: 30,
};

const EXTRACTOR_RUNNING: AirExtractorValues = {
  onoffState: true,
  fanSpeed: 45,
  flowSwitch: true,
};

// Fan commanded on but airflow not proven — the flow-switch fault case.
const EXTRACTOR_NO_FLOW: AirExtractorValues = {
  onoffState: true,
  fanSpeed: 60,
  flowSwitch: false,
};

// Minimal unit exposing only on/off — no fan speed or flow switch.
const EXTRACTOR_MINIMAL: AirExtractorValues = {
  onoffState: true,
};

function DoubleFluxUnit({
  title,
  initial,
}: {
  title: string;
  initial: AhuDoubleFluxValues;
}) {
  const [values, setValues] = useState<AhuDoubleFluxValues>(initial);

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
    <SandboxUnit
      title={title}
      running={values.onoffState ?? false}
      onToggleRunning={toggleRunning}
    >
      <AhuDoubleFluxSynoptic
        values={values}
        writableSetpoints={[
          "supplyAirTemperatureSetpoint",
          "supplyAirPressureSetpoint",
        ]}
        onSetpointSave={handleSetpointSave}
      />
    </SandboxUnit>
  );
}

function SingleFluxUnit({
  title,
  initial,
}: {
  title: string;
  initial: AhuSingleFluxValues;
}) {
  const [values, setValues] = useState<AhuSingleFluxValues>(initial);

  const handleSetpointSave = (key: AhuSingleFluxSetpointKey, value: number) => {
    setValues((current) => ({ ...current, [key]: value }));
    toast.success(`${key} → ${value}`);
  };

  const toggleRunning = (on: boolean) => {
    setValues((current) => ({
      ...current,
      onoffState: on,
      supplyFanSpeed: on ? initial.supplyFanSpeed : 0,
    }));
  };

  return (
    <SandboxUnit
      title={title}
      running={values.onoffState ?? false}
      onToggleRunning={toggleRunning}
    >
      <AhuSingleFluxSynoptic
        values={values}
        writableSetpoints={["supplyAirTemperatureSetpoint"]}
        onSetpointSave={handleSetpointSave}
      />
    </SandboxUnit>
  );
}

function ExtractorUnit({
  title,
  initial,
}: {
  title: string;
  initial: AirExtractorValues;
}) {
  const [values, setValues] = useState<AirExtractorValues>(initial);

  const toggleRunning = (on: boolean) => {
    setValues((current) => ({
      ...current,
      onoffState: on,
      fanSpeed: on ? initial.fanSpeed : 0,
      flowSwitch: on ? initial.flowSwitch : false,
    }));
  };

  return (
    <SandboxUnit
      title={title}
      running={values.onoffState ?? false}
      onToggleRunning={toggleRunning}
    >
      <AirExtractorSynoptic values={values} />
    </SandboxUnit>
  );
}

function SandboxUnit({
  title,
  running,
  onToggleRunning,
  children,
}: {
  title: string;
  running: boolean;
  onToggleRunning: (on: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor={`running-${title}`}>Running</Label>
          <Switch
            id={`running-${title}`}
            checked={running}
            onCheckedChange={onToggleRunning}
          />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Dev-only page: the standard HVAC synoptics (AHUs, air extractor) fed
 *  with hard-coded data, covering the layout variants of each type. */
export default function SynopticsSandbox() {
  return (
    <section className="space-y-6">
      <ResourceHeader
        title="HVAC synoptics"
        caption="Sandbox — hard-coded device data"
      />
      <DoubleFluxUnit
        title="CTA 01 — double flux, heating (both coils, pressure sensors)"
        initial={HEATING_UNIT}
      />
      <DoubleFluxUnit
        title="CTA 02 — double flux, cooling (no heating coil, no pressure sensors)"
        initial={COOLING_UNIT}
      />
      <SingleFluxUnit
        title="CTA 03 — single flux (heating coil only)"
        initial={SINGLE_FLUX_UNIT}
      />
      <ExtractorUnit
        title="VE01 — extractor, running (flow proven)"
        initial={EXTRACTOR_RUNNING}
      />
      <ExtractorUnit
        title="VE02 — extractor, running (no flow — fault)"
        initial={EXTRACTOR_NO_FLOW}
      />
      <ExtractorUnit
        title="VE05 — extractor, on/off only"
        initial={EXTRACTOR_MINIMAL}
      />
    </section>
  );
}
