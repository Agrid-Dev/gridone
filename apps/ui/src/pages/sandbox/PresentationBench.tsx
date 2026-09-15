import { useMemo, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Device, GridoneClient } from "@gridone/sdk";
import { GridoneError } from "@gridone/sdk";
import { Button } from "@/components/ui";
import { Label } from "@/components/ui/label";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import { DevicePresentation } from "@/components/device-ui/DevicePresentation";
import { controlSpecsOf } from "@/components/device-ui/presentationControls";
import { useDeviceControlRuntime } from "@/components/device-ui/runtime";
import {
  AGRID_THERMOSTAT_ASSETS,
  AGRID_THERMOSTAT_GLYPH_SETS,
} from "@/components/device-ui/fixtures/agridThermostat";
import { AGRID_THERMOSTAT_PRESENTATION } from "@/components/device-ui/fixtures/agridThermostat/presentation";

/**
 * The whole chain on the bench: the real renderer and the real command
 * runtime, wired to a fake device and a fake client. The fake device
 * applies a command after a latency (and echoes it, as the real one does),
 * or refuses it in one of the failure modes the runtime must survive.
 */

type Attr = {
  name: string;
  data_type: string;
  read_write_modes: string[];
  current_value: string | number | boolean | null;
  value_options?: (string | number | boolean)[];
  unit?: string;
  group?: string;
  write_constraints?: Record<string, unknown>;
};

const attr = (
  name: string,
  data_type: string,
  current_value: Attr["current_value"],
  extra: Partial<Attr> = {},
): Attr => ({
  name,
  data_type,
  read_write_modes: ["read"],
  current_value,
  ...extra,
});
const writable = (
  name: string,
  data_type: string,
  current_value: Attr["current_value"],
  extra: Partial<Attr> = {},
): Attr =>
  attr(name, data_type, current_value, {
    read_write_modes: ["read", "write"],
    ...extra,
  });

const INITIAL_ATTRIBUTES: Attr[] = [
  writable("onoff_state", "bool", true),
  attr("hvac_real_mode", "string", "heat"),
  writable("mode", "string", "heat", {
    value_options: ["fan", "heat", "cool", "auto"],
  }),
  writable("fan_speed", "string", "auto", {
    value_options: ["low", "medium", "high", "auto"],
  }),
  writable("temperature_setpoint", "float", 21, {
    unit: "°C",
    write_constraints: {
      step: { attribute: "temperature_setpoint_precision" },
      minimum: 16,
      maximum: 30,
    },
  }),
  attr("temperature_setpoint_effective", "float", 17, { unit: "°C" }),
  attr("temperature", "float", 21.4, { unit: "°C", group: "sensors" }),
  attr("humidity", "float", 44, { unit: "%", group: "sensors" }),
  attr("print_green_leaf", "bool", true),
  attr("print_indoor_temperature", "bool", true),
  attr("print_humidity", "bool", true),
  attr("temperature_setpoint_precision", "float", 0.5),
  attr("temperature_unit", "string", "TEMPERATURE_UNIT_C_ONLY"),
  attr("state_block", "bool", false),
  attr("temperature_setpoint_block", "bool", false),
  attr("hvac_mode_block", "bool", false),
  attr("fan_speed_block", "bool", false),
  attr("app_version", "string", "0.1.44", { group: "diagnostic" }),
  attr(
    "reboot_timestamp",
    "int",
    Math.floor(Date.now() / 1000) - 5 * 3600 - 50 * 60,
    {
      group: "diagnostic",
    },
  ),
];

type FaultMode = "ok" | "refuse" | "unconfirmed" | "silent";
const LATENCY_MS = 700;

function makeDevice(attributes: Attr[]): Device {
  return {
    id: "bench-thermostat",
    name: "Thermostat chambre 101",
    type: "thermostat",
    driver_id: "bench",
    transport_id: "bench",
    config: {},
    tags: {},
    is_faulty: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    attributes: Object.fromEntries(attributes.map((a) => [a.name, a])),
  } as unknown as Device;
}

function Bench() {
  const [attributes, setAttributes] = useState<Attr[]>(INITIAL_ATTRIBUTES);
  const [faultMode, setFaultMode] = useState<FaultMode>("ok");
  const [log, setLog] = useState<string[]>([]);
  const faultRef = useRef(faultMode);
  faultRef.current = faultMode;
  const attributesRef = useRef(attributes);
  attributesRef.current = attributes;

  const device = useMemo(() => makeDevice(attributes), [attributes]);
  const append = (entry: string) =>
    setLog((current) =>
      [`${new Date().toLocaleTimeString()} ${entry}`, ...current].slice(0, 15),
    );

  const [queryClient] = useState(() => new QueryClient());
  const [client] = useState(() => {
    const sendCommand = async (
      _deviceId: string,
      body: { attribute: string; value: string | number | boolean },
    ) => {
      append(
        `command ${body.attribute} = ${String(body.value)} (${faultRef.current})`,
      );
      await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
      switch (faultRef.current) {
        case "refuse":
          throw new GridoneError(
            422,
            `Value ${String(body.value)} refused by the service`,
          );
        case "unconfirmed":
          throw new GridoneError(
            409,
            "Failed to confirm: no echo from the device",
          );
        case "silent":
          await new Promise(() => {});
          break;
        default:
          setAttributes((current) =>
            current.map((a) =>
              a.name === body.attribute ||
              (body.attribute === "mode" && a.name === "hvac_real_mode")
                ? { ...a, current_value: body.value }
                : a,
            ),
          );
      }
      return { id: "cmd" };
    };
    const get = async () => makeDevice(attributesRef.current);
    return { devices: { sendCommand, get } } as unknown as GridoneClient;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <GridoneClientProvider client={client}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label>Device behaviour</Label>
            {(["ok", "refuse", "unconfirmed", "silent"] as FaultMode[]).map(
              (mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={mode === faultMode ? "default" : "outline"}
                  onClick={() => setFaultMode(mode)}
                >
                  {mode}
                </Button>
              ),
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setAttributes((current) =>
                  current.map((a) =>
                    a.name === "temperature"
                      ? {
                          ...a,
                          current_value:
                            Math.round((21 + Math.random() * 2) * 10) / 10,
                        }
                      : a,
                  ),
                )
              }
            >
              Push a new measurement
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setAttributes((current) =>
                  current.map((a) =>
                    a.name === "temperature_setpoint_block"
                      ? { ...a, current_value: !a.current_value }
                      : a,
                  ),
                )
              }
            >
              Toggle local setpoint lock
            </Button>
          </div>
          <BenchPresentation device={device} />
          <ol
            className="space-y-1 font-mono text-xs text-muted-foreground"
            data-testid="bench-log"
          >
            {log.map((entry, index) => (
              <li key={`${index}-${entry}`}>{entry}</li>
            ))}
          </ol>
        </div>
      </GridoneClientProvider>
    </QueryClientProvider>
  );
}

function BenchPresentation({ device }: { device: Device }) {
  const controls = useMemo(
    () => controlSpecsOf(AGRID_THERMOSTAT_PRESENTATION),
    [],
  );
  const runtime = useDeviceControlRuntime(device, controls);
  return (
    <DevicePresentation
      document={AGRID_THERMOSTAT_PRESENTATION}
      subject={device}
      runtime={runtime}
      assetUrl={(id) => AGRID_THERMOSTAT_ASSETS[id]}
      glyphSet={(id) => AGRID_THERMOSTAT_GLYPH_SETS[id]}
      fallback={
        <p className="text-sm text-muted-foreground">
          standard view (fallback)
        </p>
      }
      renderAttributes={({ group }) => (
        <p className="text-xs text-muted-foreground">
          generic attribute panes ({group ?? "all"})
        </p>
      )}
    />
  );
}

export function PresentationBench() {
  return <Bench />;
}
