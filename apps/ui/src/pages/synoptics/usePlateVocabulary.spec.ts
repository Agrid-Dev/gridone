import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { symbolSchemas } from "@gridone/sdk";
import en from "@/locales/en/synoptics.json";
import { createI18nMock } from "@/test/i18nMock";
import type { SlotReading } from "@/components/synoptic/values";
import { usePlateVocabulary } from "./usePlateVocabulary";

vi.mock("react-i18next", () =>
  createI18nMock({
    "slots.state": "ÉTAT",
    "types.heat_pump": "pompe à chaleur",
    "reading.updated": "mis à jour {{time}} ({{ago}})",
    "reading.silent": "aucune valeur reçue",
    "reading.stale": "valeur ancienne",
    "common.timeAgo.minutes": "il y a {{count}} min",
  }),
);

const reading = (extra: Partial<SlotReading>): SlotReading => ({
  text: "52.4",
  unit: "°C",
  raw: 52.4,
  stale: false,
  faulty: false,
  ...extra,
});

describe("usePlateVocabulary", () => {
  it("words a slot and a type from the catalogue, and humanises what the catalogue does not name", () => {
    const { result } = renderHook(() => usePlateVocabulary());
    expect(result.current.slotLabel("state")).toBe("ÉTAT");
    expect(result.current.slotLabel("supply_temp")).toBe("supply temp");
    expect(result.current.typeLabel("heat_pump")).toBe("pompe à chaleur");
    expect(result.current.typeLabel("dirt_separator")).toBe("dirt separator");
  });

  it("titles a reading with its caption, value, unit and the time the device reported it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T10:03:00Z"));
    try {
      const { result } = renderHook(() => usePlateVocabulary());
      const at = "2026-09-23T10:00:00Z";
      const title = result.current.readingTitle!(
        reading({ lastUpdated: at }),
        "ÉTAT",
      );
      expect(title).toContain("ÉTAT · 52.4 °C · mis à jour ");
      expect(title).toContain(result.current.readingTime(at));
      expect(title).toContain("(il y a 3 min)");
      expect(title).not.toContain("valeur ancienne");
      // Old: said so. Silent: said so, with no value. A note: no tooltip.
      expect(
        result.current.readingTitle!(reading({ lastUpdated: at, stale: true })),
      ).toContain("· valeur ancienne");
      expect(result.current.readingTitle!(reading({ text: null }), "T")).toBe(
        "T · aucune valeur reçue",
      );
      expect(
        result.current.readingTitle!(reading({ literal: true }), "T"),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("names every registered type and every declared slot in the catalogue, so no key ever shows", () => {
    // The English file is the reference the parity check holds French to.
    const types = Object.keys(en.types);
    const slots = Object.keys(en.slots);
    for (const [type, schema] of Object.entries(symbolSchemas)) {
      expect(types, `types.${type}`).toContain(type);
      for (const slot of schema["x-slots"] ?? []) {
        expect(slots, `slots.${slot}`).toContain(slot);
      }
    }
  });
});
