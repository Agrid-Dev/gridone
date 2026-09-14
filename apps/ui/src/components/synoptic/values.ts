import type {
  AttributeSlot,
  AttributeTarget,
  SlotValue,
  Synoptic,
} from "@gridone/sdk";
import type { AttributeValue } from "@/lib/devices";

/** One device-bound slot of a document, addressed by its `key`. */
export type BoundSlot = {
  /** `symbol.<id>.<slot>`, `pipe.<id>.flow`, `tag.<id>`, `label.<id>`. */
  key: string;
  slot: AttributeSlot;
};

/** The live reading of one slot. `text` is null when the slot is silent:
 *  no value has arrived, or it carries no timestamp. */
export type SlotReading = {
  text: string | null;
  raw: AttributeValue | null;
  stale: boolean;
  /** `Device.is_faulty` of the device the slot reads. */
  faulty: boolean;
};

export type SynopticValues = {
  slots: Record<string, SlotReading>;
  /** `Device.is_faulty` per device id the document names. */
  faultyDevices: Record<string, boolean>;
};

export const EMPTY_VALUES: SynopticValues = { slots: {}, faultyDevices: {} };

/** How a reading renders: muted and dashed once old, a dash when nothing
 *  has arrived. */
export const readingState = (reading: SlotReading) =>
  reading.stale ? "stale" : reading.text === null ? "silent" : "live";

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

/** Display text of a raw value: the label map first, then decimals and
 *  unit for numbers, the value as written otherwise. */
export function formatValue(slot: AttributeSlot, raw: AttributeValue): string {
  const label = slot.labels?.[String(raw)];
  if (label !== undefined) return label;
  const text =
    typeof raw === "number" && slot.decimals != null
      ? raw.toFixed(slot.decimals)
      : String(raw);
  return slot.unit ? `${text} ${slot.unit}` : text;
}

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
