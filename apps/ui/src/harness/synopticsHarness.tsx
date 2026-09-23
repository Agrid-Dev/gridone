// Throwaway verification harness (not committed): mounts the synoptic
// renderer on the committed plates with fixture values, without the
// authenticated app shell, so a browser can screenshot the kit.
// `?plate=<name>&projection=flat|isometric&dark=1`.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Device, Synoptic } from "@gridone/sdk";
import "@/index.css";
import "@/i18n";
import { SynopticRenderer } from "@/components/synoptic";
import type { SynopticValues } from "@/components/synoptic/values";
import { TooltipProvider } from "@/components/ui";
import { AttributeConfirmationProvider } from "@/contexts/AttributeConfirmationContext";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { PlateView } from "@/pages/synoptics/PlateView";
import ecsEst from "../../../../docs/specs/synoptic/ecs-est.json";
import ecsOuest from "../../../../docs/specs/synoptic/ecs-ouest.json";
import chaud from "../../../../docs/specs/synoptic/production-chaud.json";
import froid from "../../../../docs/specs/synoptic/production-froid.json";

const PLATES: Record<string, unknown> = {
  "ecs-est": ecsEst,
  "ecs-ouest": ecsOuest,
  "production-chaud": chaud,
  "production-froid": froid,
};

const params = new URLSearchParams(window.location.search);
const name = params.get("plate") ?? "ecs-est";
const projection = params.get("projection") as "flat" | "isometric" | null;
if (params.get("dark")) document.documentElement.classList.add("dark");

const doc = {
  ...(PLATES[name] as Synoptic),
  id: name,
  metadata: {},
  ...(projection ? { projection } : {}),
} as Synoptic;

const live = (
  text: string,
  raw: string | number | boolean,
  unit: string | null = null,
) => ({
  text,
  unit,
  raw,
  stale: false,
  faulty: false,
});

const VALUES: SynopticValues = {
  slots: {
    "symbol.pac-03.state": live("MARCHE", true),
    "symbol.pac-03.fault": live("NORMAL", false),
    "symbol.pac-04.state": { ...live("ARRÊT", false), faulty: true },
    "symbol.pac-04.fault": { ...live("DÉFAUT", true), faulty: true },
    "label.cpt-ballon-est": live("1311988992", 1311988992, "Wh"),
    "pipe.pac-03-supply.flow": live("MARCHE", true),
    "symbol.pompe-pec-d2-a.state": live("MARCHE", true),
    "symbol.pompe-pec-d2-a.speed": live("5242", 5242, "tr/min"),
    "symbol.pompe-pec-d2-b.state": live("ARRÊT", false),
    "symbol.pompe-pec-d2-b.speed": live("0", 0, "tr/min"),
    "symbol.pompe-pec-d3-a.state": live("ARRÊT", false),
    "symbol.pompe-pec-d3-a.speed": live("0", 0, "tr/min"),
    "symbol.pompe-pec-d3-b.state": { ...live("MARCHE", true), stale: true },
    "symbol.pompe-pec-d3-b.speed": {
      ...live("4800", 4800, "tr/min"),
      stale: true,
    },
    "tag.pression-pec-d2-a": live("2.1", 2.1, "bar"),
    "tag.pression-pec-d2-b": live("0.0", 0, "bar"),
    "tag.pression-pec-d3-a": live("0.0", 0, "bar"),
    "tag.tt-primaire-depart": live("71.3", 71.3, "°C"),
    "tag.tt-primaire-retour": live("54.8", 54.8, "°C"),
    "tag.tt-secondaire-depart": live("63.1", 63.1, "°C"),
    "tag.tt-manque-eau": live("NORMAL", false),
    "symbol.cpt-ec-ech-04.energy": live("238952", 238952, "Wh"),
    "symbol.pot-a-boue.fault": live("NORMAL", false),
  },
  faultyDevices: { b290fa85376a42c5: true },
};

/** A device as the API would return it, for the popover. */
const fakeDevice = (id: string): Device =>
  ({
    id,
    name: `Appareil ${id.slice(0, 4)}`,
    type: "pump",
    is_faulty: id === "b290fa85376a42c5",
    attributes: {
      onoff_state: {
        kind: "standard",
        name: "onoff_state",
        data_type: "bool",
        read_write_modes: ["read", "write"],
        current_value: true,
        last_updated: new Date().toISOString(),
        last_changed: new Date().toISOString(),
      },
      speed: {
        kind: "standard",
        name: "speed",
        data_type: "int",
        read_write_modes: ["read", "write"],
        current_value: 5242,
        unit: "tr/min",
        last_updated: new Date().toISOString(),
        last_changed: new Date().toISOString(),
      },
      fault: {
        kind: "fault",
        name: "fault",
        data_type: "bool",
        read_write_modes: ["read"],
        current_value: false,
        last_updated: new Date().toISOString(),
        last_changed: new Date().toISOString(),
      },
    },
  }) as unknown as Device;

const client = {
  devices: {
    get: async (id: string) => fakeDevice(id),
    list: async () => [],
    previewDeviceCommand: async () => ({ eligible: true, reasons: [] }),
    sendCommand: async () => undefined,
  },
};
const queryClient = new QueryClient();
const page = params.get("page") !== null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GridoneClientProvider client={client as never}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TooltipProvider>
            <AttributeConfirmationProvider>
              {page ? (
                <div className="min-h-screen bg-background p-6">
                  <PlateView
                    doc={doc}
                    values={VALUES}
                    knownSynoptics={new Set(Object.keys(PLATES))}
                    onNavigate={(id) => console.log("navigate", id)}
                  />
                </div>
              ) : (
                <div className="h-screen w-screen bg-background p-4">
                  <div className="h-full w-full overflow-hidden rounded-lg border">
                    <SynopticRenderer doc={doc} values={VALUES} />
                  </div>
                </div>
              )}
            </AttributeConfirmationProvider>
          </TooltipProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </GridoneClientProvider>
  </React.StrictMode>,
);
