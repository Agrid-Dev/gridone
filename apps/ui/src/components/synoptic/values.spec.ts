import { symbolSchemas, type AttributeSlot, type Synoptic } from "@gridone/sdk";
import { describe, expect, it } from "vitest";
import { EXAMPLE_PLATES, readPlate } from "@/test/examplePlates";
import {
  boundSlots,
  flowSlotKey,
  formatReading,
  isStale,
  READING_STATES,
  readingInk,
  readingState,
  SILENT_READING,
  type SlotReading,
  stateOf,
  symbolSlotKey,
  targetDeviceId,
  targetKey,
  truthOf,
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
  it("enumerates symbol bindings, each pipe's flow then its tags, and label attribute slots, in the backend's order", () => {
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

  it("lists each pipe's flow before its own tags and after every symbol, pipe by pipe, and carries its slot", () => {
    const flowA = slot("pump_a_on");
    const doc: Synoptic = {
      id: "p",
      name: "plate",
      metadata: {},
      symbols: [
        {
          id: "late",
          type: "pump",
          placement: { kind: "pipe", pipe: "b", cell: { x: 1, y: 0 } },
          bindings: { state: slot("on") },
        },
      ],
      pipes: [
        {
          id: "a",
          fluid: "dhw",
          from: { kind: "cell", cell: { x: 0, y: 0 } },
          to: { kind: "cell", cell: { x: 1, y: 0 } },
          flow: flowA,
          tags: [
            { id: "ta", at: { x: 0, y: 0 }, label: "TA", value: slot("t") },
          ],
        },
        {
          id: "silent",
          fluid: "dhw",
          from: { kind: "cell", cell: { x: 0, y: 1 } },
          to: { kind: "cell", cell: { x: 1, y: 1 } },
          flow: null,
          tags: [],
        },
        {
          id: "b",
          fluid: "dhw",
          from: { kind: "cell", cell: { x: 0, y: 2 } },
          to: { kind: "cell", cell: { x: 1, y: 2 } },
          flow: slot("pump_b_on"),
          tags: [
            { id: "tb", at: { x: 0, y: 2 }, label: "TB", value: slot("t") },
          ],
        },
      ],
    };
    const slots = boundSlots(doc);
    expect(slots.map((s) => s.key)).toEqual([
      "symbol.late.state",
      "pipe.a.flow",
      "tag.ta",
      "pipe.b.flow",
      "tag.tb",
    ]);
    expect(slots.find((s) => s.key === "pipe.a.flow")?.slot).toBe(flowA);
  });

  it("registers the flow of every run of the example plates that binds one, and every twin head's state, keyed as the plate reads it", () => {
    // The heating plate binds no flow: its twin pumps' heads set their
    // branches going, so those states must be read too.
    let flows = 0;
    for (const name of EXAMPLE_PLATES) {
      const doc = readPlate(name) as Synoptic;
      const keys = new Set(boundSlots(doc).map((s) => s.key));
      const flowing = (doc.pipes ?? []).filter((p) => p.flow);
      flows += flowing.length;
      for (const pipe of flowing)
        expect(keys.has(flowSlotKey(pipe.id))).toBe(true);
      for (const symbol of doc.symbols ?? []) {
        for (const roles of Object.values(
          symbolSchemas[symbol.type]?.["x-heads"] ?? {},
        )) {
          if (symbol.bindings?.[roles.state]?.kind !== "attribute") continue;
          expect(keys.has(symbolSlotKey(symbol.id, roles.state))).toBe(true);
        }
      }
      expect(flowSlotKey("pac-03-supply")).toBe("pipe.pac-03-supply.flow");
    }
    expect(flows).toBeGreaterThan(0);
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
  // A mapped label or a plain string is a state word (`word: true`), drawn
  // in the neutral ink; only a number is a reading in the reading colour.
  it.each([
    [slot("s", { labels: { true: "MARCHE" } }), true, "MARCHE", null, true],
    // A boolean the labels do not name is silent, not the word `false`.
    [slot("s", { labels: { true: "MARCHE" } }), false, null, null, undefined],
    [slot("s"), true, null, null, undefined],
    [slot("t", { unit: "°C", decimals: 1 }), 52.37, "52.4", "°C", undefined],
    [slot("t", { unit: "°C", decimals: 0 }), 52.37, "52", "°C", undefined],
    [slot("t", { decimals: 2 }), 7, "7.00", null, undefined],
    [slot("t", { unit: "kW" }), 3.14159, "3.14159", "kW", undefined],
    // A scaled register without decimals keeps six significant digits.
    [slot("t", { unit: "°C" }), 52.900000000000006, "52.9", "°C", undefined],
    [slot("t"), 1234567.891, "1\u202F234\u202F570", null, undefined],
    [slot("t"), 42, "42", null, undefined],
    // Five digits and more are grouped by three; four are left whole.
    [
      slot("e", { unit: "Wh", decimals: 0 }),
      1311988992,
      "1\u202F311\u202F988\u202F992",
      "Wh",
      undefined,
    ],
    [slot("e", { decimals: 0 }), 12345, "12\u202F345", null, undefined],
    [slot("e", { decimals: 0 }), 5242, "5242", null, undefined],
    // The rounding decides the digit count, and only the integer part groups.
    [slot("e", { decimals: 0 }), 9999.5, "10\u202F000", null, undefined],
    [
      slot("e", { decimals: 3 }),
      12345.6789,
      "12\u202F345.679",
      null,
      undefined,
    ],
    [slot("e", { decimals: 0 }), -85874, "-85\u202F874", null, undefined],
    // A reading rounded to zero carries no sign.
    [slot("p", { unit: "%", decimals: 0 }), -0.2, "0", "%", undefined],
    [slot("p", { decimals: 1 }), -0.04, "0.0", null, undefined],
    [slot("p", { decimals: 1 }), -0.06, "-0.1", null, undefined],
    // An exponent is left as the number writes it.
    [slot("e"), 1.5e25, "1.5e+25", null, undefined],
    // A word that happens to be digits reads as written.
    [slot("m"), "1234567", "1234567", null, true],
    [slot("m"), "auto", "auto", null, true],
    [slot("n", { labels: { "2": "ECO" }, unit: "x" }), 2, "ECO", null, true],
  ])("formats %j with %j as %s %s", (s, raw, text, unit, word) => {
    expect(formatReading(s, raw)).toEqual({ text, unit, word });
  });
});

describe("readingInk", () => {
  // "State words render in the neutral foreground ink; the reading colour
  // stays on numeric readings only"; anything not live is muted.
  it.each([
    ["live", false, "reading"],
    ["live", true, "foreground"],
    ["stale", false, "muted"],
    ["stale", true, "muted"],
    ["silent", false, "muted"],
    ["note", false, "muted"],
  ] as const)("inks %s (word: %s) as %s", (state, word, ink) => {
    expect(readingInk(state, word)).toBe(ink);
  });
});

describe("truthOf", () => {
  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    ["1", true],
    ["0", false],
    ["true", true],
    ["OFF", false],
    [" on ", true],
    [2, undefined],
    ["auto", undefined],
    [null, undefined],
  ])("reads %j as %s", (raw, expected) => {
    expect(truthOf(raw)).toBe(expected);
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

describe("stateOf", () => {
  const reading = (raw: SlotReading["raw"], stale = false): SlotReading => ({
    text: "x",
    unit: null,
    raw,
    stale,
    faulty: false,
  });

  it("reads a run state off the raw value, none once stale, none when nothing is bound", () => {
    expect(stateOf(reading(true))).toBe("on");
    expect(stateOf(reading("off"))).toBe("off");
    expect(stateOf(reading(1))).toBe("on");
    // A stale MARCHE is not a running machine.
    expect(stateOf(reading(true, true))).toBeUndefined();
    expect(stateOf(reading("maybe"))).toBeUndefined();
    expect(stateOf(undefined)).toBeUndefined();
  });
});

describe("READING_STATES", () => {
  it("lists every state a reading can be in, live first", () => {
    expect(READING_STATES).toEqual(["live", "stale", "silent", "note"]);
    const seen = new Set(
      [
        { ...SILENT_READING, text: "1" },
        { ...SILENT_READING, text: "1", stale: true },
        SILENT_READING,
        { ...SILENT_READING, text: "n", literal: true },
      ].map(readingState),
    );
    expect([...seen].sort()).toEqual([...READING_STATES].sort());
  });
});
