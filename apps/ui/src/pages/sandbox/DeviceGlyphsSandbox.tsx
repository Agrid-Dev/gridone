import type { Device } from "@gridone/sdk";
import { useTranslation } from "react-i18next";
import { ResourceHeader } from "@/components/ResourceHeader";
import { DeviceType } from "@/lib/devices";
import {
  DEVICE_TYPE_ORDER,
  deviceTypeBucketLabel,
  deviceTypeKeyIcon,
  groupDevicesByType,
  OTHER_KEY,
  type DeviceTypeKey,
} from "@/lib/deviceTypes";
import { cn } from "@/lib/utils";
import { DevicesGrid } from "../devices/DevicesGrid";
import type { FleetActivity } from "../devices/standard-devices/fleet-status";
import { FleetTypeTile } from "../devices/standard-devices/FleetTypeTile";

type Attributes = Record<string, unknown>;

/** An active fault attribute, for the cards that show one. */
const fault = (name: string, severity: "alert" | "warning") => ({
  name,
  kind: "fault",
  severity,
  is_faulty: true,
  current_value: true,
});

/** A fixture device of `type` reporting `attributes` (name → value, or a
 *  whole attribute when it is one — a fault). */
function fixture(
  type: string | null,
  attributes: Attributes,
  name: string = type ?? "device",
): Device {
  return {
    id: `${name}-${JSON.stringify(attributes)}`,
    name,
    type,
    tags: {},
    driver_id: "drv",
    transport_id: "tr",
    config: {},
    is_faulty: false,
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([attribute, value]) => [
        attribute,
        typeof value === "object" && value !== null && "kind" in value
          ? value
          : { name: attribute, kind: "standard", current_value: value },
      ]),
    ),
  } as unknown as Device;
}

type CardFixture = {
  name: string;
  zone: string | null;
  type: string | null;
  attributes: Attributes;
};

const ok = { connection_status: "ok" };

const CARDS: CardFixture[] = [
  {
    name: "Ch 01",
    zone: "Rez-de-chaussée · Ch 01",
    type: DeviceType.Thermostat,
    attributes: {
      ...ok,
      onoff_state: true,
      mode: "heat",
      temperature_setpoint: 20,
      temperature: 19,
    },
  },
  {
    name: "Ch 06",
    zone: "Rez-de-chaussée · Ch 06",
    type: DeviceType.Thermostat,
    attributes: {
      ...ok,
      onoff_state: true,
      mode: "cool",
      temperature_setpoint: 23,
      temperature: 20.2,
    },
  },
  {
    name: "Ch 08",
    zone: "Rez-de-chaussée · Ch 08",
    type: DeviceType.Thermostat,
    attributes: {
      ...ok,
      onoff_state: false,
      mode: "heat",
      temperature_setpoint: 16,
      temperature: 20,
    },
  },
  {
    name: "Ch 10",
    zone: "Rez-de-chaussée · Ch 10",
    type: DeviceType.Thermostat,
    attributes: {
      ...ok,
      onoff_state: true,
      mode: "fan",
      temperature_setpoint: 0,
      temperature: 21.1,
    },
  },
  {
    name: "Ch 12",
    zone: "Rez-de-chaussée · Ch 12",
    type: DeviceType.Thermostat,
    attributes: {
      connection_status: "degraded",
      onoff_state: true,
      mode: "cool",
      temperature_setpoint: 22,
      temperature: 22.8,
    },
  },
  {
    name: "Ch 14",
    zone: "Rez-de-chaussée · Ch 14",
    type: DeviceType.Thermostat,
    attributes: {
      ...ok,
      onoff_state: true,
      mode: "heat",
      temperature_setpoint: 21,
      temperature: 19.2,
      window_fault: fault("window_fault", "warning"),
    },
  },
  {
    name: "Ch 101",
    zone: "R+1 · Ch 101",
    type: DeviceType.Thermostat,
    attributes: {},
  },
  {
    name: "Ch 105",
    zone: "R+1 · Ch 105",
    type: DeviceType.Thermostat,
    attributes: {
      connection_status: "error",
      onoff_state: true,
      mode: "heat",
      temperature_setpoint: 20,
      temperature: 19.8,
    },
  },
  {
    name: "Ch 204",
    zone: "R+2 · Ch 204",
    type: DeviceType.Thermostat,
    attributes: {
      connection_status: "error",
      onoff_state: true,
      mode: "heat",
      temperature_setpoint: 21,
      temperature: 27.4,
      probe_fault: fault("probe_fault", "alert"),
    },
  },
  {
    name: "CTA Hall",
    zone: "Toiture",
    type: DeviceType.AhuDoubleFlux,
    attributes: {
      ...ok,
      onoff_state: true,
      heating_valve: 40,
      cooling_valve: 0,
      supply_air_temperature_setpoint: 19,
      supply_air_temperature: 18.4,
    },
  },
  {
    name: "CTA Restaurant",
    zone: "Toiture",
    type: DeviceType.AhuSingleFlux,
    attributes: {
      ...ok,
      onoff_state: true,
      heating_valve: 0,
      cooling_valve: 0,
      supply_air_temperature_setpoint: 18,
      supply_air_temperature: 18.9,
    },
  },
  {
    name: "PAC Sud",
    zone: "Toiture",
    type: DeviceType.Awhp,
    attributes: {
      ...ok,
      onoff_state: true,
      mode: "heat",
      setpoint_temperature: 45,
      outlet_temperature: 41.2,
    },
  },
  {
    name: "Extracteur cuisine",
    zone: "Cuisine",
    type: DeviceType.AirExtractor,
    attributes: { ...ok, onoff_state: true, fan_speed: 60 },
  },
  {
    name: "Pompe ECS",
    zone: "Local technique",
    type: DeviceType.Pump,
    attributes: {
      ...ok,
      onoff_state: false,
      pump_fault: fault("pump_fault", "warning"),
    },
  },
  {
    name: "TGBT",
    zone: "Local technique",
    type: DeviceType.ElectricityMeter,
    attributes: { ...ok, active_power: 18600, index: 48210 },
  },
  {
    name: "Station météo",
    zone: "Toiture",
    type: DeviceType.WeatherSensor,
    attributes: { ...ok, temperature: 12.4, weather_code: 2 },
  },
  {
    name: "Fuite chaufferie",
    zone: "Chaufferie",
    type: DeviceType.LiquidDetector,
    attributes: { ...ok, liquid_detected: false },
  },
  {
    name: "Chambre 201",
    zone: "R+2 · Ch 201",
    type: DeviceType.PmsMonitor,
    attributes: { ...ok, reservation_status: "checked_in", guest_count: 2 },
  },
  {
    name: "Passerelle Modbus",
    zone: null,
    type: null,
    attributes: {},
  },
];

/** `reporting` draws as `running`: one column stands for both. */
const ACTIVITIES: FleetActivity[] = ["running", "idle", "unknown"];

/** Every type's pictogram: at the group-heading size, on the card's tile in
 *  each activity, and at the icon's full 24 px. */
function PictogramMatrix() {
  const { t } = useTranslation("standardDevices");
  return (
    <div className="divide-y rounded-lg border bg-card">
      <div className="grid grid-cols-[12rem_repeat(5,minmax(0,1fr))] items-center px-4 py-2 text-xs text-muted-foreground">
        <span>Type</span>
        <span className="text-center">14 px</span>
        {ACTIVITIES.map((activity) => (
          <span key={activity} className="text-center">
            {activity}
          </span>
        ))}
        <span className="text-center">24 px</span>
      </div>
      {DEVICE_TYPE_ORDER.map((key: DeviceTypeKey) => {
        const Icon = deviceTypeKeyIcon(key);
        const device = fixture(key === OTHER_KEY ? null : key, {});
        return (
          <div
            key={key}
            className="grid grid-cols-[12rem_repeat(5,minmax(0,1fr))] items-center px-4 py-2.5"
          >
            <span className="text-sm font-medium">
              {deviceTypeBucketLabel(key, t)}
            </span>
            <span className="flex justify-center text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
            </span>
            {ACTIVITIES.map((activity) => (
              <span key={activity} className="flex justify-center">
                <FleetTypeTile device={device} activity={activity} />
              </span>
            ))}
            <span className="flex justify-center">
              <Icon className="size-6" strokeWidth={1.5} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

const DEVICES = CARDS.map(({ name, type, attributes }) =>
  fixture(type, attributes, name),
);
const ZONES = new Map(CARDS.map(({ name, zone }) => [name, zone]));

/** The fixtures as the fleet page lays them out: one group per type, its
 *  heading and the states of its cards, then the cards. */
function CardGrid() {
  return (
    <DevicesGrid
      groups={groupDevicesByType(DEVICES)}
      zonePathOf={(device) => ZONES.get(device.name) ?? null}
    />
  );
}

/** The fleet card and its type pictograms as registered: every standard type
 *  from fixture devices, in light and dark. */
export default function DeviceGlyphsSandbox() {
  return (
    <section className="space-y-6">
      <ResourceHeader
        title="Device fleet cards"
        caption="Sandbox — type pictograms and fleet cards on fixture devices"
      />
      {(["light", "dark"] as const).map((theme) => (
        <div
          key={theme}
          className={cn(
            "space-y-4 rounded-xl border bg-background p-6 text-foreground",
            theme === "dark" && "dark",
          )}
        >
          <h2 className="font-display text-lg font-semibold capitalize">
            {theme}
          </h2>
          <PictogramMatrix />
          <CardGrid />
        </div>
      ))}
    </section>
  );
}
