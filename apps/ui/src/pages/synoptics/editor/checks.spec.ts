import { describe, expect, it } from "vitest";
import type { PipeElement, SymbolElement } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { plateChecks } from "./checks";
import { NO_SAVE_ERRORS, type SaveErrors } from "./saveErrors";

const symbol = (id: string, type: string, extra: Partial<SymbolElement> = {}) =>
  ({
    id,
    type,
    placement: { kind: "cell", cell: { x: 0, y: 0 } },
    props: {},
    bindings: {},
    ...extra,
  }) as SymbolElement;
const plate = (
  symbols: SymbolElement[],
  pipes: PipeElement[] = [],
): PlateDocument => ({
  version: 1,
  name: "p",
  description: null,
  projection: "isometric",
  symbols,
  pipes,
  labels: [],
});
const diagonal = {
  id: "d",
  fluid: "dhw",
  from: { kind: "cell", cell: { x: 0, y: 5 } },
  to: { kind: "cell", cell: { x: 2, y: 7 } },
  waypoints: [],
  flow: null,
  tags: [],
} satisfies PipeElement;

describe("plateChecks", () => {
  it.each([false, true])(
    "warns about incomplete bindings even with device=%s and a valid slot",
    (device) => {
      const doc = plate([
        symbol("p", "pump", {
          device_id: device ? "dev" : null,
          bindings: {
            state: { kind: "text", text: "ON" },
            temperature: {
              kind: "attribute",
              target: { devices: {}, attribute: "  " },
            },
          },
        }),
      ]);
      expect(plateChecks(doc, NO_SAVE_ERRORS)).toEqual([
        {
          kind: "binding",
          severity: "warning",
          element: "p",
          slot: "temperature",
        },
      ]);
    },
  );

  it("reports manual overlaps as warnings naming both pipes", () => {
    const a: PipeElement = {
      ...diagonal,
      id: "a",
      to: { kind: "cell", cell: { x: 4, y: 5 } },
    };
    const b: PipeElement = { ...a, id: "b" };
    expect(plateChecks(plate([], [a, b]), NO_SAVE_ERRORS)).toEqual([
      {
        kind: "overlap",
        severity: "warning",
        element: "a",
        other: "b",
        count: 5,
      },
    ]);
  });
  it("warns about a symbol that could show readings and shows none", () => {
    expect(plateChecks(plate([symbol("p", "pump")]), NO_SAVE_ERRORS)).toEqual([
      { kind: "unbound", severity: "warning", element: "p" },
    ]);
  });

  it("is quiet about a symbol with a device, a binding, or no slot at all", () => {
    const doc = plate([
      symbol("a", "pump", { device_id: "dev" }),
      symbol("b", "pump", {
        bindings: { state: { kind: "text", text: "MARCHE" } },
      }),
      // A check valve declares no slot: nothing to bind.
      symbol("c", "valve_check"),
    ]);
    expect(plateChecks(doc, NO_SAVE_ERRORS)).toEqual([]);
  });

  it("finds a run the backend would refuse before it is asked", () => {
    expect(plateChecks(plate([], [diagonal]), NO_SAVE_ERRORS)).toEqual([
      {
        kind: "rule",
        severity: "error",
        element: "d",
        rule: "diagonal_segment",
      },
    ]);
  });

  it("lists what the last save refused first, one entry per element", () => {
    const errors: SaveErrors = {
      document: [{ path: ["name"], msg: "too short" }],
      byElement: new Map([
        ["d", [{ path: ["waypoints"], msg: "bad" }]],
        ["p", [{ path: ["bindings", "state"], msg: "unresolved" }]],
      ]),
    };
    const checks = plateChecks(
      plate([symbol("p", "pump")], [diagonal]),
      errors,
    );
    expect(checks).toEqual([
      {
        kind: "saved",
        severity: "error",
        element: null,
        message: "name: too short",
      },
      {
        kind: "saved",
        severity: "error",
        element: "d",
        message: "waypoints: bad",
      },
      {
        kind: "saved",
        severity: "error",
        element: "p",
        message: "bindings.state: unresolved",
      },
      // Mutant: without the per-element dedup the diagonal is listed twice.
      { kind: "unbound", severity: "warning", element: "p" },
    ]);
  });
});

describe("further cases, each pinned by a mutation", () => {
  const symbol = (
    id: string,
    type: string,
    extra: Partial<SymbolElement> = {},
  ): SymbolElement =>
    ({
      id,
      type,
      placement: { kind: "cell", cell: { x: 0, y: 0 } },
      props: {},
      bindings: {},
      ...extra,
    }) as SymbolElement;
  const plate = (
    symbols: SymbolElement[],
    pipes: PipeElement[] = [],
  ): PlateDocument => ({
    version: 1,
    name: "p",
    description: null,
    projection: "isometric",
    symbols,
    pipes,
    labels: [],
  });
  /** A run between two free cells through a repeated corner and a diagonal:
   *  two rules broken. */
  const twice: PipeElement = {
    id: "d",
    fluid: "dhw",
    from: { kind: "cell", cell: { x: 0, y: 5 } },
    to: { kind: "cell", cell: { x: 3, y: 8 } },
    waypoints: [
      { x: 1, y: 5 },
      { x: 1, y: 5 },
    ],
    flow: null,
    tags: [],
  };

  describe("plateChecks", () => {
    it("lists a run that breaks two rules once, under the first", () => {
      // Mutant: without the per-element set, `d` is listed twice.
      expect(plateChecks(plate([], [twice]), NO_SAVE_ERRORS)).toEqual([
        {
          kind: "rule",
          severity: "error",
          element: "d",
          rule: "zero_length_segment",
        },
      ]);
    });

    it("files a rider's own fault under the rider", () => {
      const run: PipeElement = {
        ...twice,
        id: "r",
        to: { kind: "cell", cell: { x: 4, y: 5 } },
        waypoints: [],
      };
      const tank = symbol("t", "tank", {
        placement: { kind: "pipe", pipe: "r", cell: { x: 2, y: 5 } },
        device_id: "dev",
      });
      expect(plateChecks(plate([tank], [run]), NO_SAVE_ERRORS)).toEqual([
        {
          kind: "rule",
          severity: "error",
          element: "t",
          rule: "not_inline_capable",
        },
      ]);
    });

    it("warns for every type with readings and none for types without, or unknown", () => {
      const types = [
        "heat_pump",
        "tank",
        "mixing_valve",
        "pump",
        "valve_isolation",
        "valve_control",
        "dirt_separator",
        "pump_double",
        "energy_meter",
        "loop_heater",
      ];
      const quiet = [
        "collector",
        "link",
        "plate_exchanger",
        "expansion_vessel",
        "valve_check",
        "air_separator",
        "no_such_type",
      ];
      const checks = plateChecks(
        plate([...types, ...quiet].map((type) => symbol(type, type))),
        NO_SAVE_ERRORS,
      );
      expect(checks.map((c) => c.element)).toEqual(types);
      expect(checks.every((c) => c.kind === "unbound")).toBe(true);
    });

    it("puts every error before the first warning", () => {
      const checks = plateChecks(
        plate([symbol("p", "pump")], [twice]),
        NO_SAVE_ERRORS,
      );
      expect(checks.map((c) => c.severity)).toEqual(["error", "warning"]);
    });

    it("keeps the rule of one element when the last save named another", () => {
      const errors: SaveErrors = {
        document: [],
        byElement: new Map([["p", [{ path: ["props"], msg: "bad" }]]]),
      };
      expect(
        plateChecks(
          plate([symbol("p", "pump", { device_id: "x" })], [twice]),
          errors,
        ),
      ).toEqual([
        {
          kind: "saved",
          severity: "error",
          element: "p",
          message: "props: bad",
        },
        {
          kind: "rule",
          severity: "error",
          element: "d",
          rule: "zero_length_segment",
        },
      ]);
    });
  });
});
