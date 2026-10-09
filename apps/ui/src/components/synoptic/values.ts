import type {
  AttributeSlot,
  AttributeTarget,
  Fluid,
  PipeElement,
  Severity,
  SlotValue,
  Synoptic,
} from "@gridone/sdk";
import type { AttributeValue } from "@/lib/devices";
import type { SymbolState } from "./symbols/Label";

/** One device-bound slot of a document, addressed by its `key`. */
export type BoundSlot = {
  /** `symbol.<id>.<slot>`, `pipe.<id>.flow`, `pipe.<id>.changeover`,
   *  `tag.<id>`, `label.<id>`. */
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
  /** The text is a state word (a mapped label or a plain string), not a
   *  number: drawn in the neutral ink, since the reading green on a word
   *  reads as a verdict where it only means freshness. */
  word?: boolean;
  /** The device the slot reads: the one its target names or resolves to.
   *  Absent for a literal and for a filter matching no or several devices. */
  deviceId?: string;
};

/** A reading the user activated on the plate: a tag's or a label's value,
 *  with the device it reads and the attribute it shows. */
export type ReadingTarget = {
  key: string;
  deviceId: string;
  attribute: string;
};

/** What the plate knows of a device it names: whether it is faulty, and
 *  the worst severity among its active faults. */
export type DeviceFacts = {
  faulty: boolean;
  severity: Severity | null;
};

export type SynopticValues = {
  slots: Record<string, SlotReading>;
  /** Per device id the document names. */
  devices: Record<string, DeviceFacts>;
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

/** The ink of a reading's text, decided once for every surface that
 *  prints one: the reading colour is freshness on a number, so a live
 *  word takes the neutral ink instead (a green ARRÊT would read as a
 *  verdict, and run and health stay on the LED and the fault colours);
 *  anything not live is muted. */
export type ReadingInk = "reading" | "foreground" | "muted";

export const readingInk = (state: ReadingState, word = false): ReadingInk =>
  state !== "live" ? "muted" : word ? "foreground" : "reading";

/** The ink as an HTML text colour class; SVG surfaces keep their own
 *  `fill-*` map beside the drawing code. */
export const READING_INK_TEXT: Record<ReadingInk, string> = {
  reading: "text-synoptic-reading",
  foreground: "text-foreground",
  muted: "text-muted-foreground",
};

export const symbolSlotKey = (symbolId: string, slot: string) =>
  `symbol.${symbolId}.${slot}`;
export const flowSlotKey = (pipeId: string) => `pipe.${pipeId}.flow`;
export const changeoverSlotKey = (pipeId: string) =>
  `pipe.${pipeId}.changeover`;
export const tagSlotKey = (tagId: string) => `tag.${tagId}`;
export const labelSlotKey = (labelId: string) => `label.${labelId}`;

/** Every attribute slot the plate reads, in the order the backend's
 *  `bound_slots` enumerates them: symbol bindings, each pipe's `flow`, its
 *  `changeover` then its tag values, label values. A `flow` is what sets a
 *  circuit moving in the isometric view (Decision 8 of the visual
 *  language). Literals need no device and are left out. */
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
    add(changeoverSlotKey(pipe.id), pipe.changeover?.when);
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

/** The gap between groups of three digits: a narrow no-break space. */
const DIGIT_GROUP_GAP = "\u202F";
/** Integer digits from which a number is grouped: four are left whole. */
const MIN_GROUPED_DIGITS = 5;

/** A written number with its integer digits grouped by three, as the SI
 *  writes long numbers: `1311988992` reads `1 311 988 992`, `-85874.5`
 *  reads `-85 874.5`, `5242` stays whole. The pattern takes the sign, the
 *  integer digits and whatever follows them (decimals, an exponent). */
function groupDigits(written: string): string {
  const parts = /^(-?)(\d+)(.*)$/.exec(written);
  if (!parts || parts[2].length < MIN_GROUPED_DIGITS) return written;
  const [, sign, integer, rest] = parts;
  // A gap at every position followed by a whole number of digit triples.
  return sign + integer.replace(/\B(?=(\d{3})+$)/g, DIGIT_GROUP_GAP) + rest;
}

/** A written zero without its sign: `-0` reads `0` and `-0.0` reads `0.0`,
 *  since a reading rounded to zero is not a negative one. The pattern is a
 *  minus, a zero and, optionally, decimals that are all zeros. */
const unsignedZero = (written: string) =>
  /^-0(\.0+)?$/.test(written) ? written.slice(1) : written;

/** Display text of a raw value and the unit to draw after it: a mapped
 *  label stands alone, as a word; a number takes its decimals, or a
 *  bounded precision without them, its digits grouped, and its unit; a
 *  boolean with no label for its value is silent, since `true` is not a
 *  word an operator reads; anything else reads as written, as a word. */
export function formatReading(
  slot: AttributeSlot,
  raw: AttributeValue,
): Pick<SlotReading, "text" | "unit" | "word"> {
  const label = slot.labels?.[String(raw)];
  if (label !== undefined) return { text: label, unit: null, word: true };
  if (typeof raw === "boolean") return { text: null, unit: null };
  if (typeof raw !== "number")
    return { text: String(raw), unit: slot.unit ?? null, word: true };
  const text = groupDigits(
    unsignedZero(
      slot.decimals != null
        ? raw.toFixed(slot.decimals)
        : String(Number(raw.toPrecision(DEFAULT_PRECISION))),
    ),
  );
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

/** The fluid a run shows: its `changeover` fluid while that reading is on,
 *  its own otherwise. A stale, silent or unknown reading keeps its own, as
 *  the format asks: a run leaves its drawn fluid only on a fresh reading
 *  that says so. */
export const shownFluid = (pipe: PipeElement, values: SynopticValues): Fluid =>
  pipe.changeover && stateOf(values.slots[changeoverSlotKey(pipe.id)]) === "on"
    ? pipe.changeover.fluid
    : pipe.fluid;

/** The runs as the plate shows them, each in the fluid it shows, so
 *  everything drawn or walked from them reads `fluid` alone. */
export const asShown = (
  pipes: readonly PipeElement[],
  values: SynopticValues,
): PipeElement[] =>
  pipes.map((pipe) =>
    pipe.changeover ? { ...pipe, fluid: shownFluid(pipe, values) } : pipe,
  );

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
