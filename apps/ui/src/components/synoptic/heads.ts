import { symbolSchemas, type Severity, type SymbolElement } from "@gridone/sdk";
import { faultLevel } from "./fault";
import { symbolSlotKey, truthOf, type SynopticValues } from "./values";

/** One machine of a symbol, as its click, its fault and its run state read
 *  it. A type drawn as one unit of several machines (a twin pump's duty and
 *  standby heads) has one per head, its device named per head in its
 *  props; any other symbol is one machine, keyed null, its device the
 *  symbol's own. */
export type SymbolHead = {
  key: string | null;
  deviceId: string | null;
  /** The slots this machine reads, in the order the type declares them. */
  slots: string[];
  /** The slot its run state is read from, when it has one. */
  state: string | undefined;
  /** A head's own fault contact, when its type reads one per head. */
  fault: string | undefined;
};

type HeadProps = Record<string, { device_id?: string | null } | undefined>;

export function symbolHeads(symbol: SymbolElement): SymbolHead[] {
  const schema = symbolSchemas[symbol.type];
  const slots = schema?.["x-slots"] ?? [];
  const heads = Object.entries(schema?.["x-heads"] ?? {});
  if (heads.length === 0) {
    return [
      {
        key: null,
        deviceId: symbol.device_id ?? null,
        slots,
        state: "state",
        fault: undefined,
      },
    ];
  }
  const props = symbol.props?.heads as HeadProps | undefined;
  return heads.map(([key, roles]) => {
    const own = new Set(Object.values(roles));
    return {
      key,
      deviceId: props?.[key]?.device_id ?? null,
      slots: slots.filter((slot) => own.has(slot)),
      state: roles.state,
      fault: roles.fault,
    };
  });
}

/** The machine a click or a list entry names: the head `key`, or the symbol
 *  itself when `key` is null. */
export const headOf = (symbol: SymbolElement, key: string | null) =>
  symbolHeads(symbol).find((head) => head.key === key);

/** Every device a symbol is: one, or one per head. */
export const symbolDeviceIds = (symbol: SymbolElement): string[] =>
  symbolHeads(symbol).flatMap((head) => (head.deviceId ? [head.deviceId] : []));

/** How a machine is drawn at fault: by its own fault contact when it has
 *  one that reads, since one controller behind both heads of a twin is
 *  faulty whichever head tripped; else by its device, its worst active
 *  severity. */
export function machineFault(
  symbolId: string,
  head: SymbolHead,
  values: SynopticValues,
): Severity | null {
  const contact = head.fault
    ? values.slots[symbolSlotKey(symbolId, head.fault)]
    : undefined;
  const tripped = contact && !contact.stale ? truthOf(contact.raw) : undefined;
  if (tripped !== undefined) return faultLevel(tripped, null);
  const facts = head.deviceId ? values.devices[head.deviceId] : null;
  return faultLevel(!!facts?.faulty, facts?.severity);
}

/** A head as the plant room letters it: `a` reads `A`. */
export const headName = (key: string) => key.toUpperCase();

const HEAD_SLOTS = new Map(
  Object.values(symbolSchemas).flatMap((schema) =>
    Object.entries(schema["x-heads"]).flatMap(([head, roles]) =>
      Object.entries(roles).map(
        ([role, slot]) => [slot, { head, role }] as const,
      ),
    ),
  ),
);

/** The head a slot belongs to and the role it plays there (`state_a` is
 *  head `a`'s `state`), so a caption reads the role's word and the head's
 *  letter; undefined for a slot of a machine with no heads. */
export const headSlot = (slot: string) => HEAD_SLOTS.get(slot);
