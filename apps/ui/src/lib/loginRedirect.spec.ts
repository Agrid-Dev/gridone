import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLoginReturn,
  consumeLoginReturn,
  rememberLoginReturn,
} from "./loginRedirect";

beforeEach(() => {
  sessionStorage.clear();
  consumeLoginReturn();
});
afterEach(() => vi.restoreAllMocks());
describe("login destination", () => {
  it("retains the full protected URL until a successful login consumes it", async () => {
    const url =
      "/devices/a/history?start=2026-01-01&end=2026-01-02&metric=temperature&page=2#events";
    rememberLoginReturn(url);
    rememberLoginReturn("/login");
    expect(sessionStorage.getItem("gridone.loginReturn")).toBe(url);
    vi.resetModules();
    const reloaded = await import("./loginRedirect");
    expect(reloaded.consumeLoginReturn()).toBe(url);
    expect(reloaded.consumeLoginReturn()).toBe("/");
  });
  it.each(["https://example.com", "//example.com", "/login?next=/devices"])(
    "rejects %s",
    (url) => {
      rememberLoginReturn(url);
      expect(consumeLoginReturn()).toBe("/");
    },
  );
  it("keeps nonexistent internal destinations for the normal 404", () => {
    rememberLoginReturn("/missing/resource");
    expect(consumeLoginReturn()).toBe("/missing/resource");
  });
  it("clears voluntary logout context before the auth redirect can capture it again", () => {
    rememberLoginReturn("/devices/a");
    clearLoginReturn();
    rememberLoginReturn("/devices/a");
    expect(consumeLoginReturn()).toBe("/");
    rememberLoginReturn("/devices/b");
    expect(consumeLoginReturn()).toBe("/devices/b");
  });
  it("keeps an in-memory destination when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    rememberLoginReturn("/faults?severity=alert");
    expect(consumeLoginReturn()).toBe("/faults?severity=alert");
  });
});
