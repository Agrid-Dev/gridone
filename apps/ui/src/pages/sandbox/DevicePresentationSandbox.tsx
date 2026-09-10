import { useState } from "react";
import { ResourceHeader } from "@/components/ResourceHeader";
import { Button, Switch } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { DeviceFace, type FaceAction } from "@/components/device-ui/face";
import type { Scalar } from "@/components/device-ui/conditions";
import {
  AGRID_THERMOSTAT_ASSETS,
  AGRID_THERMOSTAT_FACE,
  AGRID_THERMOSTAT_GLYPH_SETS,
} from "@/components/device-ui/fixtures/agridThermostat";
import { PUMP_FACE } from "@/components/device-ui/fixtures/pump";
import { PresentationBench } from "./PresentationBench";

/**
 * Fidelity bench for driver-defined presentations: renders declarative
 * fixtures against hand-driven telemetry and logs the actions the face
 * dispatches. No API, no writes — the fixtures stand in for a driver package
 * and this page for the device page's runtime.
 */

type Mode = "heat" | "cool" | "auto" | "fan";
type Fan = "low" | "medium" | "high" | "auto";
const MODES: Mode[] = ["heat", "cool", "auto", "fan"];
const FANS: Fan[] = ["low", "medium", "high", "auto"];

type ThermostatState = {
  power: boolean;
  mode: Mode;
  fan: Fan;
  target: number;
  measured: number | null;
  humidity: number | null;
  green_leaf: boolean;
  print_temperature: boolean;
  print_humidity: boolean;
  precision: number;
  unit: "TEMPERATURE_UNIT_C_ONLY" | "TEMPERATURE_UNIT_F_ONLY";
  state_block: boolean;
  setpoint_block: boolean;
  mode_block: boolean;
  fan_block: boolean;
};

const INITIAL: ThermostatState = {
  power: true,
  mode: "heat",
  fan: "auto",
  target: 21,
  measured: 21.4,
  humidity: 44,
  green_leaf: true,
  print_temperature: true,
  print_humidity: true,
  precision: 0.1,
  unit: "TEMPERATURE_UNIT_C_ONLY",
  state_block: false,
  setpoint_block: false,
  mode_block: false,
  fan_block: false,
};

const STEP = 0.5;
const RANGE = { min: 16, max: 30 };

function applyAction(
  state: ThermostatState,
  action: FaceAction,
): ThermostatState {
  switch (action.control) {
    case "power":
      return { ...state, power: !state.power };
    case "target": {
      const delta = action.op === "increment" ? STEP : -STEP;
      const next = Math.min(
        RANGE.max,
        Math.max(RANGE.min, state.target + delta),
      );
      return { ...state, target: next };
    }
    case "mode":
      return {
        ...state,
        mode: MODES[(MODES.indexOf(state.mode) + 1) % MODES.length],
      };
    case "fan":
      return {
        ...state,
        fan: FANS[(FANS.indexOf(state.fan) + 1) % FANS.length],
      };
    default:
      return state;
  }
}

const TOGGLES = [
  "state_block",
  "setpoint_block",
  "mode_block",
  "fan_block",
  "green_leaf",
  "print_temperature",
  "print_humidity",
] as const;

type PumpState = {
  running: boolean;
  speed_percent: number | null;
  fault_code: number;
  panel_lock: boolean;
};

const PUMP_INITIAL: PumpState = {
  running: true,
  speed_percent: 70,
  fault_code: 0,
  panel_lock: false,
};

function applyPumpAction(state: PumpState, action: FaceAction): PumpState {
  switch (action.control) {
    case "run":
      return { ...state, running: !state.running };
    case "speed": {
      const delta = action.op === "increment" ? 5 : -5;
      const next = Math.min(
        100,
        Math.max(0, (state.speed_percent ?? 0) + delta),
      );
      return { ...state, speed_percent: next };
    }
    default:
      return state;
  }
}

/** The second fixture: same engine, another product, other attribute names. */
function PumpUnit({ onLog }: { onLog: (entry: string) => void }) {
  const [state, setState] = useState<PumpState>(PUMP_INITIAL);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,320px)_1fr]">
      <DeviceFace
        document={PUMP_FACE}
        resolve={(binding) => state[binding as keyof PumpState]}
        assetUrl={() => undefined}
        glyphSet={(id) => AGRID_THERMOSTAT_GLYPH_SETS[id]}
        onAction={(action) => {
          setState((current) => applyPumpAction(current, action));
          onLog(`pump: ${action.op} ${action.control}`);
        }}
        language="fr"
      />
      <div className="flex flex-wrap items-start gap-2 text-sm">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setState((s) => ({ ...s, fault_code: s.fault_code ? 0 : 12 }))
          }
        >
          Toggle fault
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setState((s) => ({ ...s, panel_lock: !s.panel_lock }))}
        >
          Toggle panel lock
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setState((s) => ({
              ...s,
              speed_percent: s.speed_percent == null ? 70 : null,
            }))
          }
        >
          Toggle unknown speed
        </Button>
      </div>
    </div>
  );
}

export default function DevicePresentationSandbox() {
  const [state, setState] = useState<ThermostatState>(INITIAL);
  const [log, setLog] = useState<string[]>([]);
  const [scale, setScale] = useState(1);

  const resolve = (binding: string): Scalar | null | undefined =>
    state[binding as keyof ThermostatState];

  const onAction = (action: FaceAction) => {
    setState((current) => applyAction(current, action));
    setLog((current) =>
      [`${action.op} ${action.control}`, ...current].slice(0, 12),
    );
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title="Device presentations"
        caption="Sandbox — declarative fixtures, hand-driven telemetry"
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,562px)_1fr]">
        <div className="space-y-2">
          <DeviceFace
            document={AGRID_THERMOSTAT_FACE}
            resolve={resolve}
            assetUrl={(id) => AGRID_THERMOSTAT_ASSETS[id]}
            glyphSet={(id) => AGRID_THERMOSTAT_GLYPH_SETS[id]}
            onAction={onAction}
            language="fr"
            onScale={setScale}
          />
          <p className="text-xs text-muted-foreground" data-testid="face-scale">
            scale {scale.toFixed(3)} · target {state.target.toFixed(1)} · mode{" "}
            {state.mode} · fan {state.fan} · {state.power ? "on" : "off"}
          </p>
        </div>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setState((s) => ({ ...s, power: !s.power }))}
            >
              Toggle power
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setState((s) =>
                  applyAction(s, { control: "mode", op: "cycle" }),
                )
              }
            >
              Cycle mode
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  measured: s.measured == null ? INITIAL.measured : null,
                  humidity: s.humidity == null ? INITIAL.humidity : null,
                }))
              }
            >
              Toggle unknown measurements
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  precision: s.precision === 0.1 ? 1 : 0.1,
                }))
              }
            >
              Toggle precision
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  unit:
                    s.unit === "TEMPERATURE_UNIT_C_ONLY"
                      ? "TEMPERATURE_UNIT_F_ONLY"
                      : "TEMPERATURE_UNIT_C_ONLY",
                }))
              }
            >
              Toggle unit
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TOGGLES.map((lock) => (
              <div key={lock} className="flex items-center gap-2">
                <Switch
                  id={lock}
                  checked={state[lock]}
                  onCheckedChange={(checked) =>
                    setState((s) => ({ ...s, [lock]: checked }))
                  }
                />
                <Label htmlFor={lock}>{lock}</Label>
              </div>
            ))}
          </div>
          <ol
            className="space-y-1 font-mono text-xs text-muted-foreground"
            data-testid="action-log"
          >
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
        </div>
      </div>
      <PumpUnit
        onLog={(entry) => setLog((current) => [entry, ...current].slice(0, 12))}
      />
      <section className="space-y-2">
        <h3 className="text-base font-semibold">
          Whole page — real renderer and runtime on a fake device
        </h3>
        <PresentationBench />
      </section>
    </section>
  );
}
