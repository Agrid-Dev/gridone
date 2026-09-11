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
import {
  ExternalLink,
  MonitorPanel,
  Pipe,
  PidDiagram,
  PipeBadge,
  Port,
  Pump,
  SensorFlag,
  Tank,
  Valve,
} from "@/components/synoptic";

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

// Running, airflow proven — the fan spins.
const EXTRACTOR_RUNNING: AirExtractorValues = {
  onoffState: true,
  fanSpeed: 45,
  flowSwitch: true,
};

// Commanded off but airflow still proven — reverse discordance. The fan
// spins despite the stop command; the device raises the fault itself.
const EXTRACTOR_REVERSE_DISCORDANCE: AirExtractorValues = {
  onoffState: false,
  fanSpeed: 0,
  flowSwitch: true,
};

// Commanded on but no proven airflow — fan failed (belt/motor). Static.
const EXTRACTOR_FAN_FAILED: AirExtractorValues = {
  onoffState: true,
  fanSpeed: 60,
  flowSwitch: false,
};

// Minimal unit exposing only on/off — no fan speed or flow switch, so the
// animation follows the command.
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

  // The toggle drives only the command; flow_switch stays put so the
  // discordance states remain visible while toggling.
  const toggleRunning = (on: boolean) => {
    setValues((current) => ({
      ...current,
      onoffState: on,
      fanSpeed: on ? initial.fanSpeed : 0,
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

/** The vendored symbol kit on a plate, to eyeball the tokens in both themes. */
function SymbolKitPlate() {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Symbol kit on a plate</h3>
      <div className="h-80 overflow-hidden rounded-lg border">
        <PidDiagram width={900} height={360}>
          <ExternalLink
            x={20}
            y={150}
            w={150}
            h={60}
            fluid="cold_water"
            direction="in"
            label="Cold water"
          />
          <Pipe
            points={[
              { x: 170, y: 180 },
              { x: 300, y: 180 },
            ]}
            fluid="cold_water"
            flowing
          />
          <PipeBadge x={235} y={150} text="EF" />
          <Valve cx={300} cy={180} closed />
          <Pipe
            points={[
              { x: 330, y: 180 },
              { x: 400, y: 180 },
            ]}
            fluid="cold_water"
            endArrow
          />
          <Port x={400} y={180} />
          <Tank x={400} y={100} w={110} h={200} label="B-01" />
          <Port x={510} y={180} />
          <Pipe
            points={[
              { x: 510, y: 180 },
              { x: 600, y: 180 },
            ]}
            fluid="dhw"
            flowing
          />
          <Pump cx={640} cy={180} label="P-01" />
          <Pipe
            points={[
              { x: 670, y: 180 },
              { x: 880, y: 180 },
              { x: 880, y: 80 },
            ]}
            fluid="dhw"
            endArrow
            flowing={false}
          />
          <SensorFlag
            x={560}
            y={30}
            label="TT-05"
            value={57.2}
            unit="°C"
            port={{ x: 555, y: 180 }}
          />
          <MonitorPanel
            x={700}
            y={210}
            title="P-01"
            statuses={["ok", "off"]}
            rows={[
              { label: "SV", value: 60, unit: "°C" },
              { label: "PV", value: 57.2, unit: "°C" },
            ]}
          />
        </PidDiagram>
      </div>
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
      <SymbolKitPlate />
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
        title="VE02 — extractor, off but flow proven (reverse discordance)"
        initial={EXTRACTOR_REVERSE_DISCORDANCE}
      />
      <ExtractorUnit
        title="VE04 — extractor, on but no flow (fan failed)"
        initial={EXTRACTOR_FAN_FAILED}
      />
      <ExtractorUnit
        title="VE05 — extractor, on/off only"
        initial={EXTRACTOR_MINIMAL}
      />
    </section>
  );
}
