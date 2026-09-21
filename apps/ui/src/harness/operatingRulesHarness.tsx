// Throwaway verification harness for AGR-1319: mounts the real operatingRules
// list and editor against a fake client, so both screens can be looked at
// without an API or a database. Not part of the product.
import { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Device, OperatingRule } from "@gridone/sdk";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DeviceProvider } from "@/contexts/DeviceContext";
import { TooltipProvider } from "@/components/ui";
import DeviceOperatingRules from "@/pages/devices/device/operating-rules";
import schemas from "@/pages/devices/device/operating-rules/__fixtures__/schemas.json";
import "@/index.css";
import "@/i18n";

type Attr = {
  name: string;
  kind: string;
  data_type: string;
  read_write_modes: string[];
  label: { default: string };
  unit?: string;
  current_value: null;
  last_updated: null;
  last_changed: null;
};
const attr = (
  name: string,
  label: string,
  data_type: string,
  write = false,
  unit?: string,
): [string, Attr] => [
  name,
  {
    name,
    kind: "standard",
    data_type,
    read_write_modes: write ? ["read", "write"] : ["read"],
    label: { default: label },
    ...(unit ? { unit } : {}),
    current_value: null,
    last_updated: null,
    last_changed: null,
  },
];
const device = (
  id: string,
  name: string,
  attributes: [string, Attr][],
): Device =>
  ({
    id,
    name,
    driver_id: "d",
    transport_id: "t",
    config: {},
    attributes: Object.fromEntries(attributes),
  }) as unknown as Device;

const chiller = device("9f21c3b0aa14e7d2", "Chiller 1", [
  attr("start", "Start command", "bool", true),
  attr("cooling_setpoint", "Cooling setpoint", "float", true, "°C"),
]);
const pump = device("4c18ae7731b0c9f6", "Primary pump", [
  attr("flow_rate", "Flow rate", "float", false, "m³/h"),
  attr("run_status", "Run status", "bool"),
]);
const zone = device("77d15b2ce9a04318", "Zone 3", [
  attr("room_temperature", "Room temperature", "float", false, "°C"),
  attr("occupancy", "Occupancy", "bool"),
]);
const devices = [chiller, pump, zone];

const base = {
  revision: 1,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-18T10:00:00Z",
  created_by: "admin",
  updated_by: "admin",
};
const flowRule = {
  ...base,
  id: "r1",
  name: "Chiller start requires primary flow",
  explanation:
    "The chiller evaporator freezes if it starts without water circulating in the primary loop.",
  target: { device_id: chiller.id, attribute: "start", value: true },
  condition: {
    op: "all",
    conditions: [
      {
        op: "gt",
        left: { device_id: pump.id, attribute: "flow_rate" },
        right: 5,
      },
      {
        op: "is_known",
        value: { device_id: pump.id, attribute: "run_status" },
      },
    ],
  },
  points: [],
} as unknown as OperatingRule;
const brokenRule = {
  ...base,
  id: "r2",
  name: "Free cooling lockout",
  explanation: "Do not chill while the building can free-cool.",
  target: { device_id: chiller.id, attribute: "cooling_setpoint", value: 7 },
  condition: {
    op: "any",
    conditions: [
      {
        op: "gte",
        left: { device_id: "0ab7deadbeef0000", attribute: "outdoor_temp" },
        right: 14,
      },
      {
        op: "lt",
        left: { device_id: zone.id, attribute: "room_temperature" },
        right: 18,
      },
      { op: "is_known", value: { device_id: zone.id, attribute: "occupancy" } },
      {
        op: "gt",
        left: {
          op: "add",
          args: [{ device_id: zone.id, attribute: "room_temperature" }, 2],
        },
        right: 21,
      },
    ],
  },
  points: [],
} as unknown as OperatingRule;
const retiredRule = {
  ...base,
  id: "r3",
  name: "Night setback floor",
  explanation: "Superseded by the scheduler.",
  target: { device_id: chiller.id, attribute: "cooling_setpoint", value: 5 },
  condition: {
    op: "eq",
    left: { device_id: zone.id, attribute: "occupancy" },
    right: false,
  },
  retirement: {
    reason: "Replaced",
    actor_id: "admin",
    retired_at: "2026-08-04T09:00:00Z",
  },
  points: [],
} as unknown as OperatingRule;

const rules: Record<string, OperatingRule> = {
  r1: flowRule,
  r2: brokenRule,
  r3: retiredRule,
};
const history = Object.fromEntries(
  Object.values(rules).map((rule) => [rule.id, [rule]]),
);

const client = {
  me: async () => ({
    id: "u",
    email: "harness@example.com",
    permissions: [
      "operating_rules:write",
      "operating_rules:read",
      "devices:read",
    ],
  }),
  health: async () => ({ status: "ok" }),
  logout: async () => {},
  devices: {
    list: async () => devices,
    get: async (id: string) => devices.find((d) => d.id === id) ?? chiller,
  },
  operatingRules: {
    list: async () =>
      Object.values(rules).map((rule) => ({
        operating_rule: rule,
        reasons:
          rule.id === "r2"
            ? [{ code: "operating_rule_reference_invalid" }]
            : [],
      })),
    get: async (id: string) => ({
      operating_rule: rules[id] ?? flowRule,
      reasons:
        id === "r2" ? [{ code: "operating_rule_reference_invalid" }] : [],
    }),
    history: async (id: string) => history[id] ?? [],
    schemas: async () => schemas,
    create: async (body: unknown) => ({ ...flowRule, ...(body as object) }),
    update: async (_id: string, body: unknown) => ({
      ...flowRule,
      ...(body as object),
    }),
    setEnabled: async (
      id: string,
      body: { enabled: boolean; revision: number },
    ) => {
      const saved = {
        ...rules[id],
        ...body,
        revision: body.revision + 1,
        retirement: null,
      };
      rules[id] = saved;
      history[id].push(saved);
      return saved;
    },
    delete: async (id: string) => {
      delete rules[id];
    },
  },
};

const route = new URLSearchParams(location.search).get("route") ?? "";

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
              <MemoryRouter
                initialEntries={[
                  `/devices/${chiller.id}/config/operating-rules${route}`,
                ]}
              >
                <div className="mx-auto max-w-5xl p-8">
                  <Suspense fallback={<p>loading…</p>}>
                    <Routes>
                      <Route
                        path="/devices/:deviceId/config/operating-rules/*"
                        element={<DeviceOperatingRules />}
                      />
                    </Routes>
                  </Suspense>
                </div>
              </MemoryRouter>
            </TooltipProvider>
          </DeviceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GridoneClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Harness />);
