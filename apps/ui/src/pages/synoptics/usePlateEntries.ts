import { useMemo } from "react";
import type { Synoptic } from "@gridone/sdk";
import {
  headName,
  machineFault,
  symbolHeads,
} from "@/components/synoptic/heads";
import {
  stateOf,
  symbolSlotKey,
  type SynopticValues,
} from "@/components/synoptic/values";
import type { NavEntry } from "./SymbolNav";
import type { PageVocabulary } from "./usePlateVocabulary";

/** The named symbols of a plate as the equipment list reads them: by name,
 *  each with its type in the page's words, its run state and its fault. A
 *  twin pump is one entry per head, each opening its own points. */
export function usePlateEntries(
  doc: Synoptic,
  values: SynopticValues,
  vocabulary: PageVocabulary,
): NavEntry[] {
  return useMemo(
    () =>
      (doc.symbols ?? [])
        .filter((symbol) => symbol.label)
        .flatMap((symbol) =>
          symbolHeads(symbol).map((head) => {
            return {
              symbol,
              head: head.key,
              name: head.key
                ? `${symbol.label!} ${headName(head.key)}`
                : symbol.label!,
              type: vocabulary.typeLabel(symbol.type),
              state: head.state
                ? stateOf(values.slots[symbolSlotKey(symbol.id, head.state)])
                : undefined,
              fault: machineFault(symbol.id, head, values),
              device: !!head.deviceId,
            };
          }),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [doc, values, vocabulary],
  );
}
