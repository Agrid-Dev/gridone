import { useMemo } from "react";
import type { Synoptic } from "@gridone/sdk";
import { faultLevel } from "@/components/synoptic/fault";
import {
  stateOf,
  symbolSlotKey,
  type SynopticValues,
} from "@/components/synoptic/values";
import type { NavEntry } from "./SymbolNav";
import type { PageVocabulary } from "./usePlateVocabulary";

/** The named symbols of a plate as the equipment list reads them: by name,
 *  each with its type in the page's words, its run state and its fault. */
export function usePlateEntries(
  doc: Synoptic,
  values: SynopticValues,
  vocabulary: PageVocabulary,
): NavEntry[] {
  return useMemo(
    () =>
      (doc.symbols ?? [])
        .filter((symbol) => symbol.label)
        .map((symbol) => {
          const facts = symbol.device_id
            ? values.devices[symbol.device_id]
            : null;
          return {
            symbol,
            name: symbol.label!,
            type: vocabulary.typeLabel(symbol.type),
            state: stateOf(values.slots[symbolSlotKey(symbol.id, "state")]),
            fault: faultLevel(!!facts?.faulty, facts?.severity),
            device: !!symbol.device_id,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [doc, values, vocabulary],
  );
}
