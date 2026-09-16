// Throwaway verification harness for AGR-1260: mounts the group cockpit and a
// device page against a fake client, so the two screens can be looked at
// without an API or a database. Not part of the product.
import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Device, Driver } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DeviceProvider } from "@/contexts/DeviceContext";
import { TooltipProvider } from "@/components/ui";
import { AGRID_THERMOSTAT_PRESENTATION } from "@/components/device-ui/fixtures/agridThermostat/presentation";
import { AGRID_THERMOSTAT_GLYPH_SETS } from "@/components/device-ui/fixtures/agridThermostat";
import { ActiveFaultsSection } from "@/components/ActiveFaultsSection";
import { TagGroupControls } from "@/pages/devices/views/TagGroupControls";
import DeviceLiveControl from "@/pages/devices/device/DeviceLiveControl";
import bezelUrl from "@/components/device-ui/fixtures/agridThermostat/assets/thermostat-bezel.png?url";
import mainFontUrl from "@/components/device-ui/fixtures/agridThermostat/assets/main-font-atlas.png?url";
import montserratUrl from "@/components/device-ui/fixtures/agridThermostat/assets/montserrat-16-atlas.png?url";
import "@/index.css";
import "@/i18n";

const DRIVER_ID = "agrid_thermostat_mqtts";
const GROUP = "9f2c41d8e7b3a05c6d14f89b2e73c0a5";

const WRITABLE = new Set([
  "onoff_state",
  "temperature_setpoint",
  "fan_speed",
  "mode",
]);
const UNITS: Record<string, string> = {
  temperature_setpoint: "°C",
  temperature: "°C",
  temperature_setpoint_effective: "°C",
  humidity: "%",
};
const LABELS: Record<string, string> = {
  onoff_state: "Marche / arrêt",
  temperature_setpoint: "Consigne",
  temperature_setpoint_effective: "Consigne régulée",
  temperature: "Température mesurée",
  humidity: "Humidité",
  fan_speed: "Ventilation",
  mode: "Mode",
  hvac_real_mode: "Mode régulé",
  app_version: "Version du firmware",
  reboot_timestamp: "Dernier redémarrage",
};
const OPTIONS: Record<string, string[]> = {
  mode: ["fan", "heat", "cool", "auto"],
  fan_speed: ["low", "medium", "high", "auto"],
};
const NAMES = Object.keys(AGRID_THERMOSTAT_PRESENTATION.bindings).map(
  (binding) => AGRID_THERMOSTAT_PRESENTATION.bindings[binding].attribute,
);

const driver = {
  id: DRIVER_ID,
  model: "agrid_thermostat_mqtts",
  transport: "mqtt",
  device_config: [],
  presentation_revision: "harness",
  attributes: NAMES.map((name) => ({
    name,
    data_type:
      name === "temperature_setpoint" ||
      name === "temperature" ||
      name === "humidity" ||
      name === "temperature_setpoint_effective"
        ? "float"
        : name === "mode" || name === "fan_speed" || name === "hvac_real_mode"
          ? "str"
          : "bool",
    label: { default: LABELS[name] ?? name },
    unit: UNITS[name] ?? null,
    read: {},
    write: WRITABLE.has(name) ? {} : null,
    write_constraints:
      name === "temperature_setpoint"
        ? { minimum: 16, maximum: 30, step: 0.5 }
        : null,
  })),
} as unknown as Driver;

/** Eight rooms that do not all report the same thing — the aggregation this
 *  screen has to survive. */
function room(index: number): Device {
  const number = 201 + index;
  return {
    id: `room-${number}`,
    name: `Chambre ${number}`,
    type: "thermostat",
    driver_id: DRIVER_ID,
    transport_id: "mqtt",
    config: {},
    tags: { group: [GROUP] },
    presentation_ref: { revision: "harness" },
    attributes: Object.fromEntries(
      NAMES.map((name) => [
        name,
        {
          name,
          data_type: driver.attributes.find((a) => a.name === name)?.data_type,
          label: { default: LABELS[name] ?? name },
          unit: UNITS[name] ?? null,
          read_write_modes: WRITABLE.has(name) ? ["read", "write"] : ["read"],
          value_options: OPTIONS[name],
          write_constraints:
            name === "temperature_setpoint"
              ? { minimum: 16, maximum: 30, step: 0.5 }
              : null,
          current_value: current(name, index),
        },
      ]),
    ),
  } as unknown as Device;
}

function current(name: string, index: number): unknown {
  switch (name) {
    case "onoff_state":
      return true;
    case "temperature_setpoint":
      return 21;
    case "temperature_setpoint_effective":
      return 21;
    case "temperature":
      return 20.6 + index * 0.3;
    case "humidity":
      return 42 + index;
    case "mode":
    case "hvac_real_mode":
      return "heat";
    case "fan_speed":
      return index % 3 === 0 ? "auto" : "low";
    case "app_version":
      return "1.8.3";
    case "reboot_timestamp":
      return "2026-09-14T04:12:00Z";
    case "temperature_setpoint_precision":
      return 0.1;
    case "temperature_unit":
      return "TEMPERATURE_UNIT_C_ONLY";
    default:
      return false;
  }
}

const rooms = Array.from({ length: 8 }, (_, index) => room(index));
const faulty = {
  ...rooms[0],
  attributes: {
    ...rooms[0].attributes,
    filter_alarm: {
      name: "filter_alarm",
      kind: "fault",
      data_type: "bool",
      severity: "alert",
      is_faulty: true,
      current_value: true,
      label: { default: "Alarme filtre" },
      read_write_modes: ["read"],
      last_changed: "2026-09-15T22:10:00Z",
    },
  },
} as unknown as Device;
const assets: Record<string, string> = {
  bezel: bezelUrl,
  main_font: mainFontUrl,
  montserrat: montserratUrl,
};

const client = {
  me: async () => ({
    id: "u",
    email: "harness@example.com",
    permissions: ["devices:write", "devices:read"],
  }),
  health: async () => ({ status: "ok" }),
  logout: async () => {},
  drivers: {
    get: async () => driver,
    getPresentation: async () => ({
      status: "available",
      revision: "harness",
      document: {
        ...AGRID_THERMOSTAT_PRESENTATION,
        glyph_sets: AGRID_THERMOSTAT_GLYPH_SETS,
      },
    }),
    getPresentationAsset: async (_id: string, _rev: string, asset: string) =>
      fetch(assets[asset]).then((response) => response.blob()),
  },
  deviceViews: {
    list: async () => [
      {
        id: "view-1",
        name: "Chambres étage 2",
        description: "Les huit chambres du deuxième",
        group_by: [],
        filter: { tags: { group: [GROUP] } },
      },
    ],
  },
  devices: {
    get: async () => rooms[0],
    list: async () => rooms,
    listCommandsForDevice: async () => ({ items: [], total_pages: 1 }),
    getPresentation: async () => ({
      status: "available",
      revision: "harness",
      document: {
        ...AGRID_THERMOSTAT_PRESENTATION,
        glyph_sets: AGRID_THERMOSTAT_GLYPH_SETS,
      },
    }),
    getPresentationAsset: async (_id: string, _rev: string, asset: string) =>
      fetch(assets[asset]).then((response) => response.blob()),
    sendCommand: async () => ({ id: "cmd" }),
    listCommands: async () => ({ items: [], total_pages: 1 }),
    previewCommand: async (request: {
      attribute: string;
      value: unknown;
      target: unknown;
    }) => ({
      ...request,
      token: `token-${request.attribute}`,
      attribute_label: { default: LABELS[request.attribute] },
      unit: UNITS[request.attribute],
      members: rooms.map((device, index) => ({
        device_id: device.id,
        name: device.name,
        current_value: current(request.attribute, index),
        eligible: index !== 5,
        reason: index === 5 ? "control_blocked" : null,
      })),
    }),
    confirmCommand: async () => ({ batch_id: "batch-1", commands: [] }),
  },
};

const panel = new URLSearchParams(location.search).get("panel") ?? "group";

function Harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  return (
    <GridoneClientProvider client={client as never}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DeviceProvider>
            <TooltipProvider>
              <MemoryRouter initialEntries={[`/devices/${rooms[0].id}`]}>
                <div className="mx-auto max-w-6xl space-y-6 p-6">
                  {panel === "group" ? (
                    <div className="rounded-xl border bg-card p-5">
                      <TagGroupControls
                        driverId={DRIVER_ID}
                        filter={{
                          tags: { group: [GROUP] },
                          driver_id: DRIVER_ID,
                        }}
                        devices={rooms}
                        targetName="Chambres étage 2"
                      />
                    </div>
                  ) : (
                    <Suspense fallback={<p>chargement…</p>}>
                      <div style={{ marginBottom: 24 }}>
                        <ActiveFaultsSection device={faulty} />
                      </div>
                      <Routes>
                        <Route
                          path="/devices/:deviceId"
                          element={<DeviceLiveControl />}
                        />
                      </Routes>
                    </Suspense>
                  )}
                </div>
              </MemoryRouter>
            </TooltipProvider>
          </DeviceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GridoneClientProvider>
  );
}

ReactDOM.createRoot(globalThis.document.getElementById("root")!).render(
  <Harness />,
);
