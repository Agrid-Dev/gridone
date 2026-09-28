// Dev-only verification harness (committed on purpose): mounts the synoptic
// editor on the committed plates, with a client that answers from memory and
// fake devices, so a browser can drive and screenshot it without a backend
// or a login. Vite serves it in development at
// `/synoptics-editor-harness.html`; the production build never includes it,
// since `index.html` is the only build entry.
// `?plate=<name>|new&lang=en&dark=1`.
import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter, Route, Routes, useParams } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  Device,
  Synoptic,
  SynopticDocument,
  SynopticSummary,
} from "@gridone/sdk";
import "@/index.css";
import i18n from "@/i18n";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui";
import { AttributeConfirmationProvider } from "@/contexts/AttributeConfirmationContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import {
  SynopticCreate,
  SynopticEdit,
} from "@/pages/synoptics/editor/SynopticEditor";
import ecsEst from "../../../../docs/specs/synoptic/ecs-est.json";
import ecsOuest from "../../../../docs/specs/synoptic/ecs-ouest.json";
import chaud from "../../../../docs/specs/synoptic/production-chaud.json";
import froid from "../../../../docs/specs/synoptic/production-froid.json";

const PLATES: Record<string, Synoptic> = Object.fromEntries(
  Object.entries({
    "ecs-est": ecsEst,
    "ecs-ouest": ecsOuest,
    "production-chaud": chaud,
    "production-froid": froid,
  }).map(([id, plate]) => [
    id,
    {
      ...(plate as unknown as SynopticDocument),
      id,
      metadata: {
        created_at: "2026-09-24T08:00:00+00:00",
        updated_at: "2026-09-24T08:00:00+00:00",
      },
    } as Synoptic,
  ]),
);

const params = new URLSearchParams(window.location.search);
const plate = params.get("plate") ?? "ecs-est";
if (params.get("dark")) document.documentElement.classList.add("dark");
const lang = params.get("lang");
if (lang) void i18n.changeLanguage(lang);

const now = () => new Date().toISOString();
const attribute = (
  name: string,
  data_type: string,
  current_value: unknown,
  unit?: string,
) => ({
  kind: "standard",
  name,
  data_type,
  read_write_modes: ["read"],
  current_value,
  unit,
  last_updated: now(),
  last_changed: now(),
});

/** Every device a committed plate names, with the attributes its slots
 *  read, and a spare one to bind a new symbol to. */
const DEVICES: Device[] = [
  ...new Set(
    Object.values(PLATES).flatMap((p) =>
      (p.symbols ?? []).flatMap((s) => (s.device_id ? [s.device_id] : [])),
    ),
  ),
  "spare-pump",
].map(
  (id, i) =>
    ({
      id,
      name:
        id === "spare-pump"
          ? "Circulateur bouclage ECS"
          : `Appareil ${i + 1} (${id.slice(0, 4)})`,
      type: "pump",
      attributes: {
        onoff_state: attribute("onoff_state", "bool", i % 3 !== 0),
        fault: attribute("fault", "bool", false),
        speed: attribute("speed", "int", 1200 + i * 10, "tr/min"),
        temperature: attribute("temperature", "float", 50 + i / 10, "°C"),
        supply_temp: attribute("supply_temp", "float", 45.5, "°C"),
        position: attribute("position", "float", 40),
        energy: attribute("energy", "float", 123456, "kWh"),
        power: attribute("power", "float", 12.5, "kW"),
        connection_status: attribute("connection_status", "str", "ok"),
      },
    }) as unknown as Device,
);

const summaries: SynopticSummary[] = Object.values(PLATES).map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description,
  projection: p.projection ?? "isometric",
  metadata: p.metadata,
}));

const client = {
  me: async () => ({
    id: "harness",
    username: "harness",
    role: "admin",
    name: "Harness",
    email: "harness@example.invalid",
    title: "",
    must_change_password: false,
    permissions: [
      "synoptics:read",
      "synoptics:write",
      "devices:read",
      "devices:logs:read",
    ],
  }),
  health: async () => ({ version: "harness", flags: [] }),
  logout: async () => undefined,
  synoptics: {
    list: async () => ({
      items: summaries,
      total: summaries.length,
      page: 1,
      size: 50,
    }),
    get: async (id: string) => PLATES[id],
    create: async (doc: SynopticDocument) => ({
      ...doc,
      id: "saved",
      metadata: { created_at: now(), updated_at: now() },
    }),
    replace: async (id: string, doc: SynopticDocument) => ({
      ...doc,
      id,
      metadata: { created_at: now(), updated_at: now() },
    }),
  },
  devices: {
    list: async () => DEVICES,
    get: async (id: string) => DEVICES.find((d) => d.id === id),
  },
};

/** Where a save lands: the document it sent, to read back. */
function Saved() {
  const { synopticId } = useParams();
  return <p data-harness-saved>Enregistré : {synopticId}</p>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GridoneClientProvider client={client as never}>
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <TooltipProvider>
            <AttributeConfirmationProvider>
              <MemoryRouter
                initialEntries={[
                  plate === "new"
                    ? "/synoptics/new"
                    : `/synoptics/${plate}/edit`,
                ]}
              >
                <Routes>
                  <Route path="/synoptics" element={<p>Index</p>} />
                  <Route path="/synoptics/new" element={<SynopticCreate />} />
                  <Route
                    path="/synoptics/:synopticId/edit"
                    element={<SynopticEdit />}
                  />
                  <Route path="/synoptics/:synopticId" element={<Saved />} />
                </Routes>
              </MemoryRouter>
              <Toaster />
            </AttributeConfirmationProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GridoneClientProvider>
  </React.StrictMode>,
);
