import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { createI18nMock } from "@/test/i18nMock";
import { useAttributeLabel } from "./useAttributeLabel";

vi.mock("react-i18next", () =>
  createI18nMock(
    { "attributes.temperature": "Température" },
    { language: "fr-CA" },
  ),
);

/** The driver-document path is covered with the registry, in
 *  `contexts/DriverLabelsContext.spec.tsx`. */
describe("useAttributeLabel", () => {
  it("prefers a label the server resolved, in the current language", () => {
    const { result } = renderHook(() => useAttributeLabel());
    expect(
      result.current("temperature", {
        label: {
          default: "Temp",
          translations: { fr: "Température ambiante" },
        },
      }),
    ).toBe("Température ambiante");
    expect(result.current("temperature", { label: { default: "Temp" } })).toBe(
      "Temp",
    );
  });

  it("falls back to the catalog translation, then the prettified name", () => {
    const { result } = renderHook(() => useAttributeLabel());
    expect(result.current("temperature")).toBe("Température");
    expect(result.current("temperature", { label: null })).toBe("Température");
    expect(result.current("fan_speed")).toBe("Fan Speed");
  });

  it("answers from the catalog for a device when no registry is mounted", () => {
    const { result } = renderHook(() => useAttributeLabel());
    expect(
      result.current("temperature", { driver_id: "d", driver_revision: "r" }),
    ).toBe("Température");
  });
});
