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

describe("useAttributeLabel", () => {
  it("prefers the driver's declared label, resolved in the current language", () => {
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
});
