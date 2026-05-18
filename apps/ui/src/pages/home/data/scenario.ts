import { ALERT_DEVICE_ID, ALERT_ROOM_ID, allDevices } from "./washingtonOpera";

export type ScenarioState = {
  /** Number of seconds elapsed in the scripted demo loop. Wraps at LOOP_SECONDS. */
  time: number;
  /** Set of room asset ids currently in an alert state. */
  alertingRooms: Set<string>;
  /** Per-device live values. */
  values: Map<string, number>;
  /** Per-device status: 'ok' | 'alert'. */
  statuses: Map<string, "ok" | "alert">;
  /** Banner copy for an active alert, if any. */
  alertBanner: string | null;
};

export const LOOP_SECONDS = 180;

/**
 * Scripted scenario keyframes (seconds → fragment of telemetry state).
 *
 * The scenario tells a 3-minute story:
 *   0:00 — calm morning, baseline values, no alerts
 *   0:30 — sun load tints south-facing rooms warm
 *   1:30 — Pompadour Conference Room CO₂ spike → alert blooms
 *   2:00 — presenter zoom (driven by UI), alert persists
 *   2:30 — alert clears, loop resets
 */

type Phase = "morning" | "warming" | "alert" | "resolving";

function currentPhase(t: number): Phase {
  if (t < 30) return "morning";
  if (t < 90) return "warming";
  if (t < 150) return "alert";
  return "resolving";
}

/** Smooth oscillation, gives devices a 'living' feel without being chaotic. */
function jitter(seed: number, t: number, amp = 0.1): number {
  return (
    amp * Math.sin((t + seed) * 0.35) + amp * 0.5 * Math.cos(t * 0.91 + seed)
  );
}

/**
 * Compute telemetry state at time `t` seconds into the loop.
 * Pure function — no allocation outside, safe to call per frame.
 */
export function computeScenarioState(t: number): ScenarioState {
  const phase = currentPhase(t);
  const values = new Map<string, number>();
  const statuses = new Map<string, "ok" | "alert">();
  const alertingRooms = new Set<string>();

  allDevices.forEach(({ device, room }, idx) => {
    const seed = idx * 0.7;
    let value: number = device.baseline;
    let status: "ok" | "alert" = "ok";

    switch (device.kind) {
      case "thermostat": {
        // South / street-facing rooms warm up during 'warming' phase
        const isStreetFacing = room.y < 6;
        const sunBoost = isStreetFacing && phase !== "morning" ? 2.4 : 0;
        const sunRamp =
          phase === "morning"
            ? 0
            : Math.min(1, (t - 30) / 30) * (phase === "resolving" ? 0.6 : 1);
        value = device.baseline + sunBoost * sunRamp + jitter(seed, t, 0.25);
        break;
      }
      case "co2": {
        const isAlertSensor = device.id === ALERT_DEVICE_ID;
        if (isAlertSensor && (phase === "alert" || phase === "resolving")) {
          const peak = phase === "alert" ? 1450 : 900;
          const rampUp = Math.min(1, Math.max(0, (t - 90) / 15));
          const rampDown =
            phase === "resolving" ? Math.max(0, (t - 150) / 30) : 0;
          value =
            device.baseline +
            (peak - device.baseline) * rampUp * (1 - rampDown);
          if (value > 1100) {
            status = "alert";
            alertingRooms.add(room.assetId);
          }
        } else {
          value = device.baseline + jitter(seed, t, 25);
        }
        break;
      }
      case "occupancy": {
        // 0 = vacant, 1 = occupied. Flicker some on/off.
        const occupied = Math.sin((t + seed) * 0.1) > -0.3;
        value = occupied ? 1 : 0;
        break;
      }
      case "ahu": {
        value = device.baseline + jitter(seed, t, 1.2);
        break;
      }
      case "lighting": {
        value = device.baseline;
        break;
      }
    }

    values.set(device.id, value);
    statuses.set(device.id, status);
  });

  const alertBanner =
    alertingRooms.has(ALERT_ROOM_ID) && phase === "alert"
      ? "🔥 Pompadour Conference Room — CO₂ above 1400 ppm"
      : null;

  return { time: t, alertingRooms, values, statuses, alertBanner };
}

/**
 * Map a temperature to a heatmap color (cold blue → warm red).
 * Returns a CSS-compatible hex string.
 */
export function temperatureToColor(temp: number): string {
  // Clamp to [18, 28] then map linearly through HSL hue.
  const clamped = Math.max(18, Math.min(28, temp));
  const t = (clamped - 18) / 10; // 0 (cold) → 1 (hot)
  // hue: 220 (blue) → 0 (red), saturation high, lightness 50%
  const hue = 220 - t * 220;
  const sat = 75;
  const light = 55;
  return hslToHex(hue, sat, light);
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  const to255 = (n: number): string =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(r)}${to255(g)}${to255(b)}`;
}
