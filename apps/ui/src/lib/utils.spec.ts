import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { compactTimeAgo } from "./utils";

describe("compactTimeAgo", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-04-22T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an empty string when there is no timestamp", () => {
    expect(compactTimeAgo(null)).toBe("");
  });

  it("returns an empty string for an unparseable timestamp", () => {
    expect(compactTimeAgo("not-a-date")).toBe("");
  });

  it.each([
    ["2026-04-22T09:59:40Z", "now"], // < 1 min
    ["2026-04-22T09:58:00Z", "2m"],
    ["2026-04-22T08:00:00Z", "2h"],
    ["2026-04-19T10:00:00Z", "3d"],
  ])("formats %s as %s", (iso, expected) => {
    expect(compactTimeAgo(iso)).toBe(expected);
  });

  it("clamps future timestamps to now", () => {
    expect(compactTimeAgo("2026-04-22T10:05:00Z")).toBe("now");
  });
});
