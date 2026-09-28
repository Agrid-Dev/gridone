import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { humanize } from "@/components/synoptic";
import { readingState, type SlotReading } from "@/components/synoptic/values";
import type { PlateVocabulary } from "@/components/synoptic/vocabulary";
import { formatTimeAgo } from "@/lib/utils";
import type { Fluid } from "@gridone/sdk";

/** What the page adds to the renderer's vocabulary: the type names of the
 *  navigation panel and the legend, and how a time stamp is written. */
export type PageVocabulary = PlateVocabulary & {
  typeLabel: (type: string) => string;
  fluidLabel: (fluid: Fluid) => string;
  /** A reading's time of day, `HH:MM:SS` in the operator's locale. */
  readingTime: (iso: string) => string;
};

/**
 * The plate's words in the operator's language: slot captions (`ÉTAT`,
 * `DÉFAUT`), type names, and the tooltip of a reading, which says what it
 * is, what it reads and when the device last reported it. A slot or a
 * type the catalogue does not name falls back to the registry's own name,
 * humanised, so an unknown key never reads as a key.
 */
export function usePlateVocabulary(): PageVocabulary {
  const { t, i18n } = useTranslation("synoptics");
  const { t: tCommon } = useTranslation("common");
  return useMemo(() => {
    const clock = new Intl.DateTimeFormat(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const slotLabel = (slot: string) =>
      t(`slots.${slot}`, { defaultValue: humanize(slot) });
    const typeLabel = (type: string) =>
      t(`types.${type}`, { defaultValue: humanize(type) });
    const fluidLabel = (fluid: Fluid) => t(`fluids.${fluid}`);
    const readingTime = (iso: string) => clock.format(new Date(iso));
    const readingTitle = (reading: SlotReading, label?: string) => {
      const state = readingState(reading);
      // A literal of the document is a fact, not a measurement: no tooltip.
      if (state === "note") return null;
      const head = label ? `${label} · ` : "";
      if (state === "silent" || !reading.lastUpdated) {
        return `${head}${t("reading.silent")}`;
      }
      const value = reading.unit
        ? `${reading.text} ${reading.unit}`
        : `${reading.text}`;
      const when = t("reading.updated", {
        time: readingTime(reading.lastUpdated),
        ago: formatTimeAgo(Date.parse(reading.lastUpdated), tCommon),
      });
      const old = state === "stale" ? ` · ${t("reading.stale")}` : "";
      return `${head}${value} · ${when}${old}`;
    };
    return { slotLabel, typeLabel, fluidLabel, readingTitle, readingTime };
  }, [t, tCommon, i18n.language]);
}
