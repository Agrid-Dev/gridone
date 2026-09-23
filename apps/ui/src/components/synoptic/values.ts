import type {
  AttributeSlot,
  AttributeTarget,
  Severity,
  SlotValue,
  Synoptic,
} from "@gridone/sdk";
import type { AttributeValue } from "@/lib/devices";
import type { SymbolState } from "./symbols/Label";

/** One device-bound slot of a document, addressed by its `key`. */
export type BoundSlot = {
  /** `symbol.<id>.<slot>`, `pipe.<id>.flow`, `tag.<id>`, `label.<id>`. */
  key: string;
  slot: AttributeSlot;
};

/** The live reading of one slot. `text` is null when the slot is silent:
 *  no value has arrived, or it carries no timestamp. `unit` is drawn after
 *  the text, muted; null when the text is a label or the slot has none. */
export type SlotReading = {
  text: string | null;
  unit: string | null;
  raw: AttributeValue | null;
  stale: boolean;
  /** `Device.is_faulty` of the device the slot reads. */
  faulty: boolean;
  /** The worst severity among that device's active faults; null when it
   *  is healthy or nothing is known. A faulty device with no severity
   *  reads as an alert. */
  severity?: Severity | null;
  /** When the device last reported the value (ISO 8601); null or absent
   *  when nothing has arrived. */
  lastUpdated?: string | null;
  /** The slot is a text literal of the document, a fact no device reads:
   *  drawn as a note, never as a live value. */
  literal?: boolean;
};

/** What the plate knows of a device it names: whether it is faulty, and
 *  the worst severity among its active faults. */
export type DeviceFacts = {
  faulty: boolean;
  severity: Severity | null;
};

/** How the plate is fed: pushed over the socket, polled while the socket
 *  is down, or cut off when the list itself fails. */
export type LinkState = "live" | "polling" | "offline";

export type SynopticValues = {
  slots: Record<string, SlotReading>;
  /** Per device id the document names. */
  devices: Record<string, DeviceFacts>;
  /** How the values arrive; what the hook knows, a fixture need not. */
  link?: LinkState;
  /** When the plate last received values, in epoch milliseconds; null
   *  before the first. */
  refreshedAt?: number | null;
};

export const EMPTY_VALUES: SynopticValues = { slots: {}, devices: {} };

/** A slot nothing has arrived for: silent, drawn as a dash. */
export const SILENT_READING: SlotReading = {
  text: null,
  unit: null,
  raw: null,
  stale: false,
  faulty: false,
};

/** How a reading renders: a note for a literal, muted and dashed once
 *  old, a dash when nothing has arrived, the reading colour when live. */
export type ReadingState = "live" | "stale" | "silent" | "note";

/** Every reading state, in the order a legend lists them. */
export const READING_STATES = [
  "live",
  "stale",
  "silent",
  "note",
] as const satisfies readonly ReadingState[];

export const readingState = (reading: SlotReading): ReadingState =>
  reading.literal
    ? "note"
    : reading.stale
      ? "stale"
      : reading.text === null
        ? "silent"
        : "live";

export const symbolSlotKey = (symbolId: string, slot: string) =>
  `symbol.${symbolId}.${slot}`;
export const flowSlotKey = (pipeId: string) => `pipe.${pipeId}.flow`;
export const tagSlotKey = (tagId: string) => `tag.${tagId}`;
export const labelSlotKey = (labelId: string) => `label.${labelId}`;

/** Every attribute slot of a document, in the order the backend's
 *  `bound_slots` enumerates them: symbol bindings, pipe flow, tag values,
 *  label values. Literals need no device and are left out. */
export function boundSlots(doc: Synoptic): BoundSlot[] {
  const slots: BoundSlot[] = [];
  const add = (key: string, value: SlotValue | null | undefined) => {
    if (value?.kind === "attribute") slots.push({ key, slot: value });
  };
  for (const symbol of doc.symbols ?? []) {
    for (const [slot, value] of Object.entries(symbol.bindings ?? {})) {
      add(symbolSlotKey(symbol.id, slot), value);
    }
  }
  for (const pipe of doc.pipes ?? []) {
    add(flowSlotKey(pipe.id), pipe.flow);
    for (const tag of pipe.tags ?? []) add(tagSlotKey(tag.id), tag.value);
  }
  for (const label of doc.labels ?? [])
    add(labelSlotKey(label.id), label.value);
  return slots;
}

/** The device a target names outright, when its filter is a single id.
 *  Any other filter has to be resolved against the fleet. */
export function targetDeviceId(target: AttributeTarget): string | undefined {
  const { ids, types, tags } = target.devices;
  return ids?.length === 1 && !types && !tags ? ids[0] : undefined;
}

/** Stable identity of a target, so slots sharing one resolve it once. */
export const targetKey = (target: AttributeTarget) =>
  JSON.stringify(target.devices);

/** Significant digits a number keeps when the binding sets no `decimals`,
 *  so a scaled register never prints as a wall of digits. */
const DEFAULT_PRECISION = 6;

/** Display text of a raw value and the unit to draw after it: a mapped
 *  label stands alone; a number takes its decimals, or a bounded precision
 *  without them, and its unit; a boolean with no label for its value is
 *  silent, since `true` is not a word an operator reads; anything else
 *  reads as written. */
export function formatReading(
  slot: AttributeSlot,
  raw: AttributeValue,
): Pick<SlotReading, "text" | "unit"> {
  const label = slot.labels?.[String(raw)];
  if (label !== undefined) return { text: label, unit: null };
  if (typeof raw === "boolean") return { text: null, unit: null };
  const text =
    typeof raw !== "number"
      ? String(raw)
      : slot.decimals != null
        ? raw.toFixed(slot.decimals)
        : String(Number(raw.toPrecision(DEFAULT_PRECISION)));
  return { text, unit: slot.unit ?? null };
}

/** The run state a raw value stands for, whatever type the device exposes
 *  it as: a boolean, 0 / 1, or the usual words. Undefined when it is none
 *  of those, so an unknown value never lights or clears an LED. */
export function truthOf(raw: AttributeValue | null): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number")
    return raw === 1 ? true : raw === 0 ? false : undefined;
  if (typeof raw === "string") {
    const word = raw.trim().toLowerCase();
    if (["true", "on", "1"].includes(word)) return true;
    if (["false", "off", "0"].includes(word)) return false;
  }
  return undefined;
}

/** The run state a symbol shows for its `state` reading: none once the
 *  reading is old, since a stale MARCHE is not a running machine, and
 *  none for a value that is no state at all. */
export const stateOf = (
  reading: SlotReading | undefined,
): SymbolState | undefined => {
  if (!reading || reading.stale) return undefined;
  const on = truthOf(reading.raw);
  return on === undefined ? undefined : on ? "on" : "off";
};

/** A value is stale once older than its threshold: the binding's, else the
 *  document's. Without either it never goes stale. */
export function isStale(
  lastUpdated: string,
  staleAfter: number | null | undefined,
  now: Date,
): boolean {
  if (staleAfter == null) return false;
  return now.getTime() - Date.parse(lastUpdated) > staleAfter * 1000;
}
