// Throwaway verification harness (not committed): mounts the presentation
// sandbox without the authenticated app shell. With `?state=<name>` it renders
// the bare thermostat face in one of the firmware reference states so a
// headless browser can screenshot it for pixel comparison.
import React from "react";
import { PerformanceProbe } from "./PerformanceProbe";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { TooltipProvider } from "@/components/ui";
import "@/index.css";
import "@/i18n";
import DevicePresentationSandbox from "@/pages/sandbox/DevicePresentationSandbox";
import { PresentationBench } from "@/pages/sandbox/PresentationBench";
import { DeviceFace } from "@/components/device-ui/face";
import type { Scalar } from "@/components/device-ui/conditions";
import {
  AGRID_THERMOSTAT_ASSETS,
  AGRID_THERMOSTAT_FACE,
  AGRID_THERMOSTAT_GLYPH_SETS,
} from "@/components/device-ui/fixtures/agridThermostat";

type Params = {
  screen: "on" | "off";
  hvac?: string;
  fanspeed?: string;
  tsetpoint?: number;
  tenth_visible?: boolean;
  temp_text?: string | null;
  hum_text?: string | null;
  leaf?: boolean;
  unit?: string;
  locks?: string[];
};

const base: Params = {
  screen: "on",
  hvac: "heat",
  fanspeed: "auto",
  tsetpoint: 21,
  tenth_visible: true,
  temp_text: "21.4°C",
  hum_text: "44%",
  leaf: true,
  unit: "C",
};

const STATES: Record<string, Params> = {
  "on-heat-21.0-fanauto-temp21.4-hum44": base,
  "on-cool-21.0-fanauto-temp21.4-hum44": { ...base, hvac: "cool" },
  "on-auto-21.0-fanauto-temp21.4-hum44": { ...base, hvac: "auto" },
  "on-fan-mode": { ...base, hvac: "fan", fanspeed: "medium" },
  "on-heat-21-precision1": { ...base, tenth_visible: false },
  "on-heat-locked": {
    ...base,
    locks: ["state", "fan", "hvac", "plus", "minus"],
  },
  "on-heat-fanlow-70F": {
    ...base,
    tsetpoint: 70,
    fanspeed: "low",
    temp_text: "70.5°F",
    unit: "F",
  },
  "on-heat-no-leaf-no-humidity": { ...base, hum_text: null, leaf: false },
  off: { screen: "off" },
  "off-locked": { screen: "off", locks: ["state"] },
};

function bindingsFor(params: Params): Record<string, Scalar | null> {
  const locks = new Set(params.locks ?? []);
  return {
    power: params.screen === "on",
    mode: params.hvac ?? "heat",
    fan: params.fanspeed ?? "auto",
    target: params.tsetpoint ?? 21,
    measured: params.temp_text ? Number.parseFloat(params.temp_text) : null,
    humidity: params.hum_text ? Number.parseFloat(params.hum_text) : null,
    print_temperature: params.temp_text != null,
    print_humidity: params.hum_text != null,
    green_leaf: params.leaf ?? false,
    precision: params.tenth_visible === false ? 1 : 0.1,
    unit: `TEMPERATURE_UNIT_${params.unit ?? "C"}_ONLY`,
    state_block: locks.has("state"),
    fan_block: locks.has("fan"),
    mode_block: locks.has("hvac"),
    setpoint_block: locks.has("plus") || locks.has("minus"),
  };
}

const search = new URLSearchParams(window.location.search);
const stateName = search.get("state");
const params = stateName ? STATES[stateName] : undefined;
const benchOnly = search.has("bench");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {search.has("perf") ? (
      <PerformanceProbe />
    ) : params ? (
      <div
        style={{
          width: 562,
          height: 402,
          position: "absolute",
          left: 0,
          top: 0,
        }}
      >
        <DeviceFace
          document={AGRID_THERMOSTAT_FACE}
          resolve={(b) => bindingsFor(params)[b]}
          assetUrl={(id) => AGRID_THERMOSTAT_ASSETS[id]}
          glyphSet={(id) => AGRID_THERMOSTAT_GLYPH_SETS[id]}
          onAction={() => {}}
          language="fr"
        />
      </div>
    ) : benchOnly ? (
      <BrowserRouter>
        <TooltipProvider>
          <div className="p-6">
            <PresentationBench />
          </div>
        </TooltipProvider>
      </BrowserRouter>
    ) : (
      <BrowserRouter>
        <TooltipProvider>
          <div className="p-6">
            <DevicePresentationSandbox />
          </div>
        </TooltipProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
);
