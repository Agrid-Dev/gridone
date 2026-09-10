import type { PresentationV1 } from "../../document";
import { AGRID_THERMOSTAT_FACE } from "./face";

/**
 * The whole presentation document of the thermostat fixture: the page the
 * target design asks for (setpoint table, controls, measurements, the
 * live replica) around the face. Binding ids are the ones the face uses;
 * attribute names are the driver's. This is what the pilot driver's
 * `presentation` block will carry.
 */
export const AGRID_THERMOSTAT_PRESENTATION: PresentationV1 = {
  schema_version: 1,
  requires: [
    "layout/1",
    "controls/1",
    "measurements/1",
    "setpoint-table/1",
    "device-face/1",
    "glyph-text/1",
    "conditions/1",
  ],
  assets: {
    bezel: { path: "assets/bezel.png" },
    main_font: { path: "assets/main-font-atlas.png" },
    montserrat: { path: "assets/montserrat-16-atlas.png" },
  },
  bindings: {
    power: { attribute: "onoff_state" },
    mode: { attribute: "hvac_real_mode" },
    mode_setting: { attribute: "mode" },
    fan: { attribute: "fan_speed" },
    target: { attribute: "temperature_setpoint" },
    regulated: { attribute: "temperature_setpoint_effective" },
    measured: { attribute: "temperature" },
    humidity: { attribute: "humidity" },
    green_leaf: { attribute: "print_green_leaf" },
    print_temperature: { attribute: "print_indoor_temperature" },
    print_humidity: { attribute: "print_humidity" },
    precision: { attribute: "temperature_setpoint_precision" },
    unit: { attribute: "temperature_unit" },
    state_block: { attribute: "state_block" },
    setpoint_block: { attribute: "temperature_setpoint_block" },
    mode_block: { attribute: "hvac_mode_block" },
    fan_block: { attribute: "fan_speed_block" },
    firmware: { attribute: "app_version" },
    last_reboot: { attribute: "reboot_timestamp" },
  },
  controls: {
    power: {
      kind: "toggle",
      binding: "power",
      label: { default: "Power", translations: { fr: "Marche / arrêt" } },
    },
    target: {
      kind: "number",
      binding: "target",
      label: { default: "Setpoint", translations: { fr: "Consigne" } },
    },
    fan: {
      kind: "select",
      binding: "fan",
      label: { default: "Fan speed", translations: { fr: "Ventilation" } },
    },
    // The face's mode key cycles the writable standard `mode`; the icon it
    // shows binds to the resolved real mode reported by the device.
    mode: {
      kind: "select",
      binding: "mode_setting",
      label: { default: "Mode", translations: { fr: "Mode" } },
    },
  },
  page: {
    kind: "columns",
    items: [
      {
        weight: 3,
        content: {
          kind: "stack",
          children: [
            {
              kind: "section",
              title: {
                default: "Setpoints and measurements",
                translations: { fr: "Consignes et mesures" },
              },
              description: {
                default:
                  "What Gridone demands, what the device regulates, what the room measures",
                translations: {
                  fr: "Ce que Gridone demande, ce que l'appareil régule, ce que la chambre mesure",
                },
              },
              children: [
                {
                  kind: "setpoint-table",
                  rows: [
                    {
                      label: {
                        default: "Temperature",
                        translations: { fr: "Température" },
                      },
                      demanded: { control: "target" },
                      regulated: { binding: "regulated" },
                      measured: { binding: "measured" },
                      deviation: {
                        minuend: "measured",
                        subtrahend: "target",
                        tolerance: 0.5,
                      },
                      formatter: { decimals: 1 },
                    },
                  ],
                },
                { kind: "control-panel", controls: ["power", "mode", "fan"] },
              ],
            },
            {
              kind: "section",
              title: {
                default: "Reported by the room",
                translations: { fr: "Ce qui remonte de la chambre" },
              },
              children: [
                {
                  kind: "measurements",
                  items: [
                    { binding: "measured", formatter: { decimals: 1 } },
                    {
                      binding: "humidity",
                      formatter: {
                        decimals: 0,
                        unavailable: {
                          default: "sensor not connected",
                          translations: { fr: "capteur non branché" },
                        },
                      },
                    },
                    { binding: "firmware" },
                    {
                      binding: "last_reboot",
                      formatter: { relative_time: true },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        weight: 2,
        content: {
          kind: "section",
          title: { default: "Live", translations: { fr: "En direct" } },
          children: [AGRID_THERMOSTAT_FACE],
        },
      },
    ],
  },
};
