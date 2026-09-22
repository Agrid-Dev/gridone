import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { useValueLabel } from "./useValueLabel";

vi.mock("react-i18next", () =>
  createI18nMock(
    { "common.true": "Vrai", "common.false": "Faux" },
    { language: "fr-CA" },
  ),
);

const labels = [
  {
    value: false,
    label: { default: "Stopped", translations: { fr: "Arrêt" } },
  },
  {
    value: true,
    label: { default: "Running", translations: { fr: "Marche" } },
  },
];

describe("useValueLabel", () => {
  it("resolves the declared label for the state in the current language", () => {
    const { result } = renderHook(() => useValueLabel());
    // The entry is picked by its `value`, not by list position.
    expect(result.current(true, labels)).toBe("Marche");
    expect(result.current(false, labels)).toBe("Arrêt");
    expect(result.current(true, [labels[1]])).toBe("Marche");
  });

  it("falls back to the localized True / False, never On / Off", () => {
    const { result } = renderHook(() => useValueLabel());
    expect(result.current(true)).toBe("Vrai");
    expect(result.current(false, null)).toBe("Faux");
    expect(result.current(false, [])).toBe("Faux");
  });
});
