import type { Condition } from "../../conditions";
import type {
  Anchor,
  Box,
  DeviceFaceDocument,
  FaceAction,
  FaceLayer,
  LayerColor,
  TextPart,
} from "../../face";
import bezelUrl from "./assets/thermostat-bezel.png";

/**
 * Device-face fixture of the Agrid thermostat, expressed only with the
 * generic vocabulary (no vendor code): a bezel image, a screen rectangle,
 * bitmap-font glyph runs and the firmware's touch zones, in the device's
 * own 480×320 pixel grid offset by the bezel padding.
 *
 * Every box and alignment comes from the firmware sources
 * (`lvgl_ui/main_ui.c`, `top_line.c`, `off_ui.c`, `utils/ui_utils.c`) as
 * resolved by the LVGL layout export used by the fidelity spec: containers
 * are aligned with `lv_obj_align`, glyph labels are centred in them, lock
 * icons are aligned on the icon label they annotate (`lv_obj_align_to`).
 */

/** Bezel padding + 1 px border: the LCD's top-left corner in the view box. */
export const LCD_ORIGIN = { x: 41, y: 41 } as const;
export const LCD_SIZE = { width: 480, height: 320 } as const;

/** A box given in LCD coordinates, moved into the view box. */
function lcd(x: number, y: number, width: number, height: number): Box {
  return { x: LCD_ORIGIN.x + x, y: LCD_ORIGIN.y + y, width, height };
}

// Firmware object rectangles (LCD coordinates, landscape layout).
const SCREEN = lcd(0, 0, LCD_SIZE.width, LCD_SIZE.height);
const ALL_DIGITS = lcd(153, 98, 185, 95);
const BTN_ONOFF = lcd(0, 220, 120, 100);
const BTN_FAN = lcd(180, 220, 120, 100);
const BTN_MODE = lcd(360, 220, 120, 100);
const BTN_PLUS = lcd(335, 95, 120, 100);
const BTN_MINUS = lcd(25, 95, 120, 100);
const BTN_ON = lcd(165, 85, 150, 150);
const TOP_SLOT_LEFT = lcd(153, 20, 25, 25);
const TOP_SLOT_RIGHT = lcd(273, 20, 25, 25);
const TOP_SLOT_SINGLE = lcd(213, 20, 25, 25);
const LEAF = lcd(428, 20, 22, 22);
const TOP_LINE_GAP = 10;
const TOP_LINE_WIDTH = 60;

// Glyphs of the firmware's main font (private-use code points).
const G = {
  auto: "",
  cool: "",
  degC: "",
  fanMode: "",
  fan1: "",
  fan2: "",
  fan3: "",
  fanAuto: "",
  fanWord: "",
  degF: "",
  leaf: "",
  heat: "",
  humidity: "",
  locked: "",
  thermometer: "",
  off: "",
  power: "",
} as const;
const TENTHS = "";

const GREY = "#bebebe";
const WHITE = "#ffffff";
const MODE_COLORS = { heat: "#8caee7", cool: "#d69263", auto: "#84f3f7" };
const FAN_MODE_COLOR = "#ffefc0";

const eq = (binding: string, value: string | number | boolean): Condition => ({
  op: "eq",
  binding,
  value,
});
const all = (...conditions: Condition[]): Condition => ({
  op: "all",
  conditions,
});
const not = (condition: Condition): Condition => ({ op: "not", condition });

const powerOn = eq("power", true);
const powerOff = eq("power", false);
const fanMode = eq("mode", "fan");
const showsSetpoint = all(powerOn, not(fanMode));
const digitColor: LayerColor = {
  rules: [
    { when: eq("mode", "heat"), color: MODE_COLORS.heat },
    { when: eq("mode", "cool"), color: MODE_COLORS.cool },
    { when: eq("mode", "auto"), color: MODE_COLORS.auto },
  ],
  default: WHITE,
};
const modeIconColor: LayerColor = {
  rules: [...digitColor.rules, { when: fanMode, color: FAN_MODE_COLOR }],
  default: GREY,
};

const setpointDigit = (
  place: "tens" | "units" | "tenths",
  dx: number,
  dy: number,
  visible: Condition = showsSetpoint,
): FaceLayer => ({
  kind: "glyph-text",
  glyph_set: "main",
  anchor: { box: ALL_DIGITS, align: "center", dx, dy },
  text: [
    place === "tenths"
      ? { digit: { binding: "target", place, chars: TENTHS } }
      : { digit: { binding: "target", place } },
  ],
  color: digitColor,
  visible_when: visible,
});

/** Icon + value pair of the top line, at a given slot box. */
function topLine(
  slot: Box,
  icon: string,
  text: TextPart[],
  visible: Condition,
): FaceLayer[] {
  return [
    {
      kind: "glyph-text",
      glyph_set: "main",
      anchor: { box: slot, align: "center" },
      text: [{ literal: icon }],
      color: GREY,
      clip: slot,
      visible_when: visible,
    },
    {
      kind: "glyph-text",
      glyph_set: "montserrat",
      anchor: { box: slot, align: "out-right-mid", dx: TOP_LINE_GAP },
      size: { width: TOP_LINE_WIDTH },
      text,
      color: GREY,
      visible_when: visible,
    },
  ];
}

const temperatureText: TextPart[] = [
  { number: { binding: "measured", decimals: 1 } },
  {
    select: {
      binding: "unit",
      cases: {
        TEMPERATURE_UNIT_C: "°C",
        TEMPERATURE_UNIT_C_ONLY: "°C",
        TEMPERATURE_UNIT_F: "°F",
        TEMPERATURE_UNIT_F_ONLY: "°F",
      },
      default: "°C",
    },
  },
];
const humidityText: TextPart[] = [
  { number: { binding: "humidity", decimals: 0 } },
  { literal: "%" },
];
const printTemperature = all(powerOn, eq("print_temperature", true));
const printHumidity = all(powerOn, eq("print_humidity", true));

const button = (
  box: Box,
  label: { default: string; translations: { fr: string } },
  action: FaceAction,
  visible: Condition,
  blocked: Condition,
): FaceLayer => ({
  kind: "button",
  box,
  label,
  action,
  visible_when: visible,
  blocked_when: blocked,
});

const lock = (anchor: Anchor, visible: Condition): FaceLayer => ({
  kind: "glyph-text",
  glyph_set: "main",
  anchor,
  text: [{ literal: G.locked }],
  color: WHITE,
  visible_when: visible,
  label: {
    default: "Locked on the device",
    translations: { fr: "Verrouillé sur l'appareil" },
  },
});

export const AGRID_THERMOSTAT_ASSETS: Record<string, string> = {
  bezel: bezelUrl,
};

export const AGRID_THERMOSTAT_FACE: DeviceFaceDocument = {
  kind: "device-face",
  label: { default: "Thermostat", translations: { fr: "Thermostat" } },
  view_box: { width: 562, height: 402 },
  layers: [
    {
      kind: "image",
      asset: "bezel",
      box: { x: 0, y: 0, width: 562, height: 402 },
    },
    // ON screen background: the firmware paints the whole screen (58, 58, 58).
    {
      kind: "rect",
      box: SCREEN,
      fill: "#3a3a3a",
      radius: 8,
      visible_when: powerOn,
    },

    // Setpoint: tens, units, tenths (dot glyphs, only with a fractional
    // step) and the unit glyph, four labels centred in the digits container.
    setpointDigit("tens", -54, 0),
    setpointDigit("units", 11, 0),
    setpointDigit(
      "tenths",
      72,
      25,
      all(showsSetpoint, {
        op: "in",
        binding: "precision",
        values: [0.1, 0.2, 0.5],
      }),
    ),
    {
      kind: "glyph-text",
      glyph_set: "main",
      anchor: { box: ALL_DIGITS, align: "center", dx: 70, dy: -25 },
      text: [
        {
          select: {
            binding: "unit",
            cases: {
              TEMPERATURE_UNIT_C: G.degC,
              TEMPERATURE_UNIT_C_ONLY: G.degC,
              TEMPERATURE_UNIT_F: G.degF,
              TEMPERATURE_UNIT_F_ONLY: G.degF,
            },
            default: G.degC,
          },
        },
      ],
      color: digitColor,
      visible_when: showsSetpoint,
    },
    // FAN mode replaces the setpoint with the word FAN.
    {
      kind: "glyph-text",
      glyph_set: "main",
      anchor: { box: SCREEN, align: "center", dy: -20 },
      text: [{ literal: G.fanWord }],
      color: FAN_MODE_COLOR,
      visible_when: all(powerOn, fanMode),
    },
    // +/− bars: 50×3 and 3×50 grey bars centred in their (transparent) button.
    {
      kind: "rect",
      box: lcd(370, 144, 50, 3),
      fill: GREY,
      visible_when: showsSetpoint,
    },
    {
      kind: "rect",
      box: lcd(394, 120, 3, 50),
      fill: GREY,
      visible_when: showsSetpoint,
    },
    {
      kind: "rect",
      box: lcd(60, 144, 50, 3),
      fill: GREY,
      visible_when: showsSetpoint,
    },

    // Bottom icons, centred in their buttons.
    {
      kind: "glyph-text",
      id: "icon_power",
      glyph_set: "main",
      anchor: { box: BTN_ONOFF, align: "center" },
      text: [{ literal: G.power }],
      color: GREY,
      visible_when: powerOn,
    },
    {
      kind: "glyph-text",
      id: "icon_fan",
      glyph_set: "main",
      anchor: { box: BTN_FAN, align: "center" },
      text: [
        {
          select: {
            binding: "fan",
            cases: {
              low: G.fan1,
              medium: G.fan2,
              high: G.fan3,
              auto: G.fanAuto,
            },
          },
        },
      ],
      color: GREY,
      visible_when: powerOn,
    },
    {
      kind: "glyph-text",
      id: "icon_mode",
      glyph_set: "main",
      anchor: { box: BTN_MODE, align: "center" },
      text: [
        {
          select: {
            binding: "mode",
            cases: { heat: G.heat, cool: G.cool, auto: G.auto, fan: G.fanMode },
          },
        },
      ],
      color: modeIconColor,
      visible_when: powerOn,
    },

    // Top line: temperature and humidity, two slots when both are printed,
    // one centred slot otherwise.
    ...topLine(
      TOP_SLOT_LEFT,
      G.thermometer,
      temperatureText,
      all(printTemperature, eq("print_humidity", true)),
    ),
    ...topLine(
      TOP_SLOT_RIGHT,
      G.humidity,
      humidityText,
      all(printHumidity, eq("print_temperature", true)),
    ),
    ...topLine(
      TOP_SLOT_SINGLE,
      G.thermometer,
      temperatureText,
      all(printTemperature, not(eq("print_humidity", true))),
    ),
    ...topLine(
      TOP_SLOT_SINGLE,
      G.humidity,
      humidityText,
      all(printHumidity, not(eq("print_temperature", true))),
    ),
    // Green leaf, clipped by its 22×22 container like on the device.
    {
      kind: "glyph-text",
      glyph_set: "main",
      anchor: { box: LEAF, align: "center" },
      text: [{ literal: G.leaf }],
      color: "#218a21",
      clip: LEAF,
      visible_when: all(powerOn, eq("green_leaf", true)),
      label: {
        default: "Energy saving",
        translations: { fr: "Économie d'énergie" },
      },
    },

    // Touch zones (ON screen).
    button(
      BTN_ONOFF,
      { default: "Turn off", translations: { fr: "Éteindre" } },
      { control: "power", op: "toggle" },
      powerOn,
      eq("state_block", true),
    ),
    button(
      BTN_FAN,
      { default: "Fan speed", translations: { fr: "Ventilation" } },
      { control: "fan", op: "cycle" },
      powerOn,
      eq("fan_block", true),
    ),
    button(
      BTN_MODE,
      { default: "Mode", translations: { fr: "Mode" } },
      { control: "mode", op: "cycle" },
      powerOn,
      eq("mode_block", true),
    ),
    button(
      BTN_PLUS,
      {
        default: "Increase setpoint",
        translations: { fr: "Augmenter la consigne" },
      },
      { control: "target", op: "increment" },
      showsSetpoint,
      eq("setpoint_block", true),
    ),
    button(
      BTN_MINUS,
      {
        default: "Decrease setpoint",
        translations: { fr: "Diminuer la consigne" },
      },
      { control: "target", op: "decrement" },
      showsSetpoint,
      eq("setpoint_block", true),
    ),

    // Lock icons: the device flashes them on a blocked touch; the replica
    // shows them while the block is active.
    lock(
      { ref: "icon_power", align: "center", dx: 30, dy: -30 },
      all(powerOn, eq("state_block", true)),
    ),
    lock(
      { ref: "icon_fan", align: "center", dx: 35, dy: -30 },
      all(powerOn, eq("fan_block", true)),
    ),
    lock(
      { ref: "icon_mode", align: "center", dx: 30, dy: -30 },
      all(powerOn, eq("mode_block", true)),
    ),
    lock(
      { box: BTN_PLUS, align: "center", dx: 20, dy: -40 },
      all(showsSetpoint, eq("setpoint_block", true)),
    ),
    lock(
      { box: BTN_MINUS, align: "center", dx: 20, dy: -40 },
      all(showsSetpoint, eq("setpoint_block", true)),
    ),

    // OFF screen: black screen (the bezel image), one power glyph and one
    // 150×150 zone in the centre.
    {
      kind: "glyph-text",
      id: "icon_off",
      glyph_set: "main",
      anchor: { box: BTN_ON, align: "center" },
      text: [{ literal: G.off }],
      color: "#c0c0c0",
      visible_when: powerOff,
    },
    button(
      BTN_ON,
      { default: "Turn on", translations: { fr: "Allumer" } },
      { control: "power", op: "toggle" },
      powerOff,
      eq("state_block", true),
    ),
    lock(
      { ref: "icon_off", align: "center", dx: 60, dy: -60 },
      all(powerOff, eq("state_block", true)),
    ),
  ],
};
