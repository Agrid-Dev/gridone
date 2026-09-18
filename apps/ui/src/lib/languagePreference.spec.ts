import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyLanguage, readLanguage } from "./languagePreference";
import { clearLoginReturn } from "./loginRedirect";
import { clearNavigation } from "./navigation";
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it.each([null, "de", "en-US", "", "fr"])(
  "defaults to French for %s",
  (stored) => {
    if (stored !== null) localStorage.setItem("gridone.language", stored);
    expect(readLanguage()).toBe("fr");
  },
);
it("persists English and updates html lang, including after logout", () => {
  applyLanguage("en");
  expect(document.documentElement.lang).toBe("en");
  expect(readLanguage()).toBe("en");
  clearNavigation();
  clearLoginReturn();
  expect(readLanguage()).toBe("en");
  applyLanguage("de");
  expect(document.documentElement.lang).toBe("en");
  expect(readLanguage()).toBe("en");
});
it("starts and changes language when storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("disabled");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("disabled");
  });
  expect(readLanguage()).toBe("fr");
  expect(() => applyLanguage("en")).not.toThrow();
  expect(document.documentElement.lang).toBe("en");
});
