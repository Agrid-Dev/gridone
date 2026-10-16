import { describe, expect, it } from "vitest";
import { deviceHistoryPath } from "./deviceSections";

describe("deviceHistoryPath", () => {
  it("opens the history chart on the attributes, over the period", () => {
    const path = deviceHistoryPath("room 203", {
      attrs: ["window_open", "temperature"],
      start: new Date("2026-10-14T06:42:00Z"),
      end: new Date("2026-10-14T08:28:00Z"),
    });
    const url = new URL(path, "http://gridone.test");
    expect(url.pathname).toBe("/devices/room%20203/history/chart");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      attrs: "window_open,temperature",
      start: "2026-10-14T06:42:00.000Z",
      end: "2026-10-14T08:28:00.000Z",
    });
  });

  it("leaves the period open-ended while it is still running", () => {
    const path = deviceHistoryPath("pump", {
      attrs: ["fault_code"],
      start: new Date("2026-10-14T06:42:00Z"),
      end: null,
    });
    const url = new URL(path, "http://gridone.test");
    expect(url.searchParams.has("end")).toBe(false);
    expect(url.searchParams.get("start")).toBe("2026-10-14T06:42:00.000Z");
  });
});
