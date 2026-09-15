import type { AttributeSlot, Synoptic } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import {
  boundSlots,
  formatReading,
  isStale,
  readingState,
  targetDeviceId,
  targetKey,
} from "./values";

const slot = (
  attribute: string,
  extra: Partial<AttributeSlot> = {},
): AttributeSlot => ({
  kind: "attribute",
  target: { devices: { ids: ["dev"] }, attribute },
  ...extra,
});

const DOC: Synoptic = {
  id: "p",
  name: "plate",
  metadata: {},
  symbols: [
    {
      id: "pac",
      type: "heat_pump",
      placement: { kind: "cell", cell: { x: 0, y: 0 } },
      bindings: { state: slot("onoff_state"), power: slot("power") },
    },
    {
      id: "bare",
      type: "tank",
      placement: { kind: "cell", cell: { x: 2, y: 0 } },
    },
  ],
  pipes: [
    {
      id: "run",
      fluid: "dhw",
      from: { kind: "cell", cell: { x: 0, y: 0 } },
      to: { kind: "cell", cell: { x: 1, y: 0 } },
      flow: slot("onoff_state"),
      tags: [
        { id: "tt", at: { x: 0, y: 0 }, label: "TT", value: slot("temp") },
        { id: "code", at: { x: 1, y: 0 }, label: "LPS" },
      ],
    },
  ],
  labels: [
    {
      id: "note",
      at: { x: 0, y: 0 },
      text: "rooms",
      role: "note",
      value: { kind: "text", text: "104" },
    },
    { id: "title", at: { x: 0, y: 0 }, text: "ECS", role: "title" },
    {
      id: "temp",
      at: { x: 0, y: 0 },
      text: "outdoor",
      role: "caption",
      value: slot("outdoor"),
    },
  ],
};

describe("boundSlots", () => {
  it("enumerates symbol bindings, pipe flow, tag and label attribute slots in order", () => {
    expect(boundSlots(DOC).map((s) => s.key)).toEqual([
      "symbol.pac.state",
      "symbol.pac.power",
      "pipe.run.flow",
      "tag.tt",
      "label.temp",
    ]);
  });

  it("carries the slot through and leaves literals out", () => {
    const temp = boundSlots(DOC).find((s) => s.key === "label.temp");
    expect(temp?.slot).toEqual(slot("outdoor"));
    expect(boundSlots(DOC).some((s) => s.key === "label.note")).toBe(false);
  });

  it("is empty for a bare envelope", () => {
    expect(boundSlots({ id: "e", name: "e", metadata: {} })).toEqual([]);
  });
});

describe("targetDeviceId", () => {
  it.each([
    [{ ids: ["a"] }, "a"],
    [{ ids: ["a", "b"] }, undefined],
    [{ ids: [] }, undefined],
    [{ ids: ["a"], types: ["awhp"] }, undefined],
    [{ types: ["awhp"] }, undefined],
    [{ tags: { room: ["1"] } }, undefined],
  ])("%j resolves to %s outright", (devices, expected) => {
    expect(targetDeviceId({ devices, attribute: "x" })).toBe(expected);
  });

  it("keys a target by its device filter", () => {
    expect(targetKey({ devices: { types: ["awhp"] }, attribute: "a" })).toBe(
      targetKey({ devices: { types: ["awhp"] }, attribute: "b" }),
    );
    expect(targetKey({ devices: { ids: ["a"] }, attribute: "a" })).not.toBe(
      targetKey({ devices: { ids: ["b"] }, attribute: "a" }),
    );
  });
});

describe("formatReading", () => {
  it.each([
    [slot("s", { labels: { true: "MARCHE" } }), true, "MARCHE", null],
    [slot("s", { labels: { true: "MARCHE" } }), false, "false", null],
    [slot("t", { unit: "°C", decimals: 1 }), 52.37, "52.4", "°C"],
    [slot("t", { unit: "°C", decimals: 0 }), 52.37, "52", "°C"],
    [slot("t", { decimals: 2 }), 7, "7.00", null],
    [slot("t", { unit: "kW" }), 3.14159, "3.14159", "kW"],
    [slot("t"), 42, "42", null],
    [slot("m"), "auto", "auto", null],
    [slot("n", { labels: { "2": "ECO" }, unit: "x" }), 2, "ECO", null],
  ])("formats %j with %j as %s %s", (s, raw, text, unit) => {
    expect(formatReading(s, raw)).toEqual({ text, unit });
  });
});

describe("isStale", () => {
  const now = new Date("2026-09-14T12:00:00Z");
  const ago = (seconds: number) =>
    new Date(now.getTime() - seconds * 1000).toISOString();

  it("never goes stale without a threshold", () => {
    expect(isStale(ago(1e9), null, now)).toBe(false);
    expect(isStale(ago(1e9), undefined, now)).toBe(false);
  });

  it("is stale only once the age passes the threshold", () => {
    expect(isStale(ago(60), 60, now)).toBe(false);
    expect(isStale(ago(60.001), 60, now)).toBe(true);
    expect(isStale(ago(0), 60, now)).toBe(false);
  });

  it("treats a zero threshold as stale at any age", () => {
    expect(isStale(ago(0.001), 0, now)).toBe(true);
  });
});

describe("readingState", () => {
  it.each([
    ["52.4 °C", false, "live"],
    ["52.4 °C", true, "stale"],
    [null, false, "silent"],
    [null, true, "stale"],
  ])("text %s stale %s reads %s", (text, stale, expected) => {
    expect(
      readingState({ text, unit: null, raw: null, stale, faulty: false }),
    ).toBe(expected);
  });
});
