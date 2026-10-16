// Dev-only verification harness (committed on purpose): mounts the heat
// pump control on fixture devices, in each mode, running and stopped,
// without the authenticated app shell, so a browser can screenshot the
// drawing. Vite serves it in development at `/awhp-harness.html`; the
// production build never includes it, since `index.html` is the only
// build entry. `?dark=1&lang=en` as the other harnesses.
import React from "react";
import ReactDOM from "react-dom/client";
import type { Device } from "@gridone/sdk";
import "@/index.css";
import i18n from "@/i18n";
import { TooltipProvider } from "@/components/ui";
import { DeviceType } from "@/lib/devices";
import { AwhpControl } from "@/pages/devices/standard-devices/awhp";

const params = new URLSearchParams(window.location.search);
if (params.get("dark")) document.documentElement.classList.add("dark");
const lang = params.get("lang");
if (lang) void i18n.changeLanguage(lang);

type Fixture = Record<string, { value: unknown; type?: string; unit?: string }>;

function device(id: string, fixture: Fixture): Device {
  const attributes = Object.fromEntries(
    Object.entries(fixture).map(([name, { value, type, unit }]) => [
      name,
      {
        name,
        data_type: type ?? "float",
        read_write_modes: ["read"],
        current_value: value,
        last_updated: null,
        ...(unit ? { unit } : {}),
      },
    ]),
  );
  return {
    id,
    name: id,
    type: DeviceType.Awhp,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    attributes: attributes as Device["attributes"],
    is_faulty: false,
  };
}

const full = (mode: string, on: boolean): Fixture => ({
  onoff_state: { value: on, type: "bool" },
  unit_run_status: { value: on ? "running" : "standby", type: "string" },
  mode: { value: mode, type: "string" },
  inlet_temperature: { value: mode === "heat" ? 40.2 : 12.3 },
  outlet_temperature: { value: mode === "heat" ? 45.1 : 7.1 },
  setpoint_temperature: { value: mode === "heat" ? 45 : 7 },
  outdoor_temperature: { value: mode === "heat" ? 7.4 : 31.5 },
  compressor_suction_temperature: { value: 2.1 },
  compressor_suction_pressure: { value: 7.6, unit: "bar" },
  compressor_discharge_temperature: { value: 71.8 },
  compressor_discharge_pressure: { value: 29.4, unit: "bar" },
  condenser_refrigerant_pressure: { value: 29.1, unit: "bar" },
  evaporator_refrigerant_pressure: { value: 7.4, unit: "bar" },
});

const sparse: Fixture = {
  onoff_state: { value: true, type: "bool" },
  mode: { value: "cool", type: "string" },
  inlet_temperature: { value: 12.3 },
  outlet_temperature: { value: 7.1 },
  compressor_discharge_pressure: { value: 16.8 },
};

const noop = {
  draft: {},
  savingAttr: null,
  feedback: null,
  onDraftChange: () => {},
  onSave: () => {},
};

const cases = [
  ["cool, running", device("awhp-cool", full("cool", true))],
  ["heat, running", device("awhp-heat", full("heat", true))],
  ["cool, stopped", device("awhp-off", full("cool", false))],
  ["sparse driver", device("awhp-sparse", sparse)],
  ["faulty", { ...device("awhp-fault", full("heat", true)), is_faulty: true }],
] as const;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 p-8">
        {cases.map(([title, dev]) => (
          <section
            key={dev.id}
            data-case={dev.id}
            className="flex flex-col gap-3"
          >
            <h2 className="text-sm font-semibold text-muted-foreground">
              {title}
            </h2>
            <AwhpControl device={dev} {...noop} />
          </section>
        ))}
      </main>
    </TooltipProvider>
  </React.StrictMode>,
);
