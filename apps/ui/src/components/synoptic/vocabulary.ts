import { humanize } from "./text";
import type { SlotReading } from "./values";

/**
 * The words the renderer writes that a page may translate: the renderer
 * itself knows no locale, so a page hands it a vocabulary and the plate
 * reads in the operator's language. The default is the registry's own
 * names, humanised, which is what a plate drawn with no page shows.
 */
export type PlateVocabulary = {
  /** The caption of a panel row or a chip for a slot the type declares. */
  slotLabel: (slot: string) => string;
  /** The tooltip of a reading, built by the page from the reading and its
   *  caption; null when nothing is worth saying (a literal). */
  readingTitle?: (reading: SlotReading, label?: string) => string | null;
};

export const DEFAULT_VOCABULARY: PlateVocabulary = { slotLabel: humanize };
