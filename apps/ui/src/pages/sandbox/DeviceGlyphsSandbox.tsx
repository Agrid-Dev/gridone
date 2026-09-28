import type { Device } from "@gridone/sdk";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DeviceType } from "@/lib/devices";
import { cn } from "@/lib/utils";
import { getFleetGlyph } from "../devices/standard-devices/registry";

type Attributes = Record<string, unknown>;

/** A fixture device of `type` reporting `attributes` (name → value). */
function fixture(type: string | null, attributes: Attributes): Device {
  return {
    id: `${type}-${JSON.stringify(attributes)}`,
    name: type ?? "device",
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: false,
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([name, value]) => [
        name,
        { name, kind: "standard", current_value: value },
      ]),
    ),
  } as unknown as Device;
}

type Row = {
  type: string | null;
  title: string;
  states: [string, Attributes][];
};

const ROWS: Row[] = [
  {
    type: DeviceType.Thermostat,
    title: "Thermostat",
    states: [
      ["heat", { onoff_state: true, mode: "heat" }],
      ["cool", { onoff_state: true, mode: "cool" }],
      ["auto", { onoff_state: true, mode: "auto" }],
      ["off", { onoff_state: false, mode: "heat" }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.AhuDoubleFlux,
    title: "Air handler — double flow",
    states: [
      ["heat", { onoff_state: true, hvac_mode: "heat" }],
      ["cool", { onoff_state: true, hvac_mode: "cool" }],
      ["off", { onoff_state: false }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.AhuSingleFlux,
    title: "Air handler — single flow",
    states: [
      ["heat", { onoff_state: true, hvac_mode: "heat" }],
      ["cool", { onoff_state: true, hvac_mode: "cool" }],
      ["off", { onoff_state: false }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.AirExtractor,
    title: "Air extractor",
    states: [
      ["running", { onoff_state: true }],
      ["off", { onoff_state: false }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.Awhp,
    title: "Heat pump",
    states: [
      ["heat", { onoff_state: true, mode: "heat" }],
      ["cool", { onoff_state: true, mode: "cool" }],
      ["off", { onoff_state: false }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.Pump,
    title: "Pump",
    states: [
      ["running", { onoff_state: true }],
      ["stopped", { onoff_state: false }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.ElectricityMeter,
    title: "Electricity meter",
    states: [
      ["reporting", { active_power: 240 }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.WeatherSensor,
    title: "Weather sensor",
    states: [
      ["clear", { weather_code: 0 }],
      ["partly cloudy", { weather_code: 2 }],
      ["rain", { weather_code: 63 }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.LiquidDetector,
    title: "Leak detector",
    states: [
      ["detected", { liquid_detected: true }],
      ["dry", { liquid_detected: false }],
      ["no data", {}],
    ],
  },
  {
    type: DeviceType.PmsMonitor,
    title: "PMS monitor",
    states: [
      ["occupied", { reservation_status: "checked_in" }],
      ["booked", { reservation_status: "booked" }],
      ["free", { reservation_status: "checked_out" }],
      ["no data", {}],
    ],
  },
  { type: null, title: "Other (no standard type)", states: [["—", {}]] },
];

function StateMatrix() {
  return (
    <div className="divide-y rounded-lg border bg-card">
      {ROWS.map((row) => {
        const Glyph = getFleetGlyph(row.type);
        return (
          <div key={row.title} className="flex items-center gap-6 px-4 py-3">
            <span className="w-44 shrink-0 text-sm font-medium">
              {row.title}
            </span>
            <div className="flex flex-wrap gap-6">
              {row.states.map(([caption, attributes]) => (
                <figure
                  key={caption}
                  className="flex w-24 flex-col items-center gap-1.5"
                >
                  <Glyph device={fixture(row.type, attributes)} />
                  <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
                    {caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The fleet card type glyphs as registered: every standard type in each of
 *  its states, from fixture devices, in light and dark. */
export default function DeviceGlyphsSandbox() {
  return (
    <section className="space-y-6">
      <ResourceHeader
        title="Device type glyphs"
        caption="Sandbox — the registry's fleet glyphs on fixture devices"
      />
      {(["light", "dark"] as const).map((theme) => (
        <div
          key={theme}
          className={cn(
            "space-y-3 rounded-xl border bg-background p-6 text-foreground",
            theme === "dark" && "dark",
          )}
        >
          <h2 className="font-display text-lg font-semibold capitalize">
            {theme}
          </h2>
          <StateMatrix />
        </div>
      ))}
    </section>
  );
}
