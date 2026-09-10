import type { Condition } from "../../conditions";
import type { Box, DeviceFaceDocument, FaceLayer } from "../../face";

/**
 * Second device-face fixture, structurally different from the thermostat: a
 * variable-speed pump controller with a status lamp, a one-line display and
 * three keys. Attributes are named differently (`running`, `speed_percent`,
 * `fault_code`, `panel_lock`) and there is no bezel image nor custom font —
 * only rectangles, the generic Montserrat glyph set and buttons. It exists
 * to show the same primitives serve another product without any engine
 * change or vendor branch.
 */

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

const running = eq("running", true);
const stopped = eq("running", false);
const healthy = eq("fault_code", 0);
const faulted = not(healthy);
const lockedLocally = eq("panel_lock", true);

const CASING: Box = { x: 0, y: 0, width: 320, height: 200 };
const DISPLAY: Box = { x: 40, y: 36, width: 240, height: 64 };
const LAMP: Box = { x: 22, y: 22, width: 10, height: 10 };
const KEY_RUN: Box = { x: 40, y: 124, width: 72, height: 48 };
const KEY_MINUS: Box = { x: 136, y: 124, width: 60, height: 48 };
const KEY_PLUS: Box = { x: 220, y: 124, width: 60, height: 48 };

const keyCap = (box: Box): FaceLayer => ({
  kind: "rect",
  box,
  fill: "#3f4650",
  radius: 6,
});

/** A centred bar inside a key, the way the thermostat draws its +/−. */
const bar = (key: Box, width: number, height: number): FaceLayer => ({
  kind: "rect",
  box: {
    x: key.x + Math.trunc(key.width / 2) - Math.trunc(width / 2),
    y: key.y + Math.trunc(key.height / 2) - Math.trunc(height / 2),
    width,
    height,
  },
  fill: "#e5e7eb",
});

/** The status lamp: one rectangle per state, selected by conditions. */
const lamp = (fill: string, when: Condition): FaceLayer => ({
  kind: "rect",
  box: LAMP,
  fill,
  radius: 5,
  visible_when: when,
});

export const PUMP_FACE: DeviceFaceDocument = {
  kind: "device-face",
  label: {
    default: "Pump controller",
    translations: { fr: "Régulateur de pompe" },
  },
  view_box: { width: 320, height: 200 },
  layers: [
    { kind: "rect", box: CASING, fill: "#262b33", radius: 12 },
    {
      kind: "rect",
      box: { x: 20, y: 20, width: 14, height: 14 },
      fill: "#111418",
      radius: 7,
    },
    lamp("#e5484d", faulted),
    lamp("#30a46c", all(running, healthy)),
    lamp("#6b7280", all(stopped, healthy)),
    { kind: "rect", box: DISPLAY, fill: "#0b1a10", radius: 4 },
    // Speed, centred in the display; nothing is drawn while it is unknown.
    {
      kind: "glyph-text",
      glyph_set: "montserrat",
      anchor: { box: DISPLAY, align: "center" },
      text: [
        { number: { binding: "speed_percent", decimals: 0 } },
        { literal: "%" },
      ],
      color: "#39ff88",
      visible_when: all(running, healthy),
    },
    // A fault replaces the speed with its code.
    {
      kind: "glyph-text",
      glyph_set: "montserrat",
      anchor: { box: DISPLAY, align: "center" },
      text: [
        { literal: "F" },
        { number: { binding: "fault_code", decimals: 0 } },
      ],
      color: "#ff5c5c",
      visible_when: faulted,
    },
    // Stopped and healthy: dashes.
    {
      kind: "glyph-text",
      glyph_set: "montserrat",
      anchor: { box: DISPLAY, align: "center" },
      text: [{ literal: "---" }],
      color: "#39ff88",
      visible_when: all(stopped, healthy),
    },
    keyCap(KEY_RUN),
    keyCap(KEY_MINUS),
    keyCap(KEY_PLUS),
    bar(KEY_RUN, 24, 3),
    bar(KEY_MINUS, 20, 3),
    bar(KEY_PLUS, 20, 3),
    bar(KEY_PLUS, 3, 20),
    {
      kind: "button",
      box: KEY_RUN,
      label: { default: "Run / stop", translations: { fr: "Marche / arrêt" } },
      action: { control: "run", op: "toggle" },
      blocked_when: lockedLocally,
    },
    {
      kind: "button",
      box: KEY_MINUS,
      label: {
        default: "Decrease speed",
        translations: { fr: "Réduire la vitesse" },
      },
      action: { control: "speed", op: "decrement" },
      visible_when: running,
      blocked_when: lockedLocally,
    },
    {
      kind: "button",
      box: KEY_PLUS,
      label: {
        default: "Increase speed",
        translations: { fr: "Augmenter la vitesse" },
      },
      action: { control: "speed", op: "increment" },
      visible_when: running,
      blocked_when: lockedLocally,
    },
  ],
};
