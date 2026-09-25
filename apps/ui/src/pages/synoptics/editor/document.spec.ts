import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  Cell,
  PipeElement,
  Side,
  SymbolElement,
  Synoptic,
  SlotValue,
} from "@gridone/sdk";
import {
  attachedPorts,
  boundDevice,
  defaultProps,
  duplicateSymbol,
  emptyDocument,
  hasRaisedElements,
  moveSymbol,
  nextId,
  removePipe,
  removeSymbol,
  rotateSymbol,
  routeWaypoints,
  setCollectorAxis,
  toDocument,
  withDevice,
  type RoutePoint,
} from "./document";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";

const PLATE: Synoptic = {
  ...JSON.parse(
    readFileSync(
      resolve(
        import.meta.dirname,
        "../../../../../../docs/specs/synoptic/ecs-ouest.json",
      ),
      "utf8",
    ),
  ),
  id: "ouest",
  metadata: {
    created_at: "2026-09-17T12:00:00+00:00",
    updated_at: "2026-09-17T12:00:00+00:00",
  },
};

const pipe = (doc: PlateDocument, id: string): PipeElement =>
  doc.pipes!.find((p) => p.id === id)!;

describe("toDocument", () => {
  it("strips the envelope and nothing else, so the body is the export", () => {
    const doc = toDocument(PLATE);
    expect(doc).not.toHaveProperty("id");
    expect(doc).not.toHaveProperty("metadata");
    // Mutant: a document that drops labels or defaults would still save.
    expect(doc.labels).toHaveLength(5);
    expect(doc.defaults).toEqual(PLATE.defaults);
  });
});

describe("nextId", () => {
  it("takes the smallest number no symbol, pipe, tag or label uses", () => {
    const doc: PlateDocument = {
      ...emptyDocument("p"),
      symbols: [
        {
          id: "pump-1",
          type: "pump",
          placement: { kind: "cell", cell: { x: 0, y: 0 } },
        },
      ],
      pipes: [
        {
          id: "pump-2",
          fluid: "dhw",
          from: { kind: "cell", cell: { x: 0, y: 0 } },
          to: { kind: "cell", cell: { x: 1, y: 0 } },
          tags: [{ id: "pump-3", at: { x: 0, y: 0 }, label: "t" }],
        },
      ],
      labels: [{ id: "pump-4", at: { x: 0, y: 0 }, text: "t", role: "note" }],
    };
    // Mutant: a namespace of symbols alone would answer pump-2.
    expect(nextId(doc, "pump")).toBe("pump-5");
    expect(nextId(doc, "tank")).toBe("tank-1");
  });
});

describe("routeWaypoints", () => {
  const cell = (x: number, y: number, z = 0): Cell => ({ x, y, z });

  it("leaves a port through its face and enters the other through its face", () => {
    // A heat pump supply on +x at (1,1) feeding a tank primary_in on -x at (5,3):
    // the run must first step to (2,1) and arrive from (4,3).
    const waypoints = routeWaypoints([
      {
        endpoint: { kind: "port", symbol: "pac", port: "supply" },
        cell: cell(1, 1),
        side: "+x",
      },
      {
        endpoint: { kind: "port", symbol: "b", port: "primary_in" },
        cell: cell(5, 3),
        side: "-x",
      },
    ]);
    // Mutant: a dominant-axis-first route ignoring sides gives [(5,1)],
    // which the backend refuses as port_side_mismatch.
    expect(waypoints).toEqual([cell(4, 1), cell(4, 3)]);
  });

  it("climbs before travelling to a raised waypoint and descends after it", () => {
    // The overhead feed of the real plates, as an author clicks it: a free
    // start, one waypoint at level 1 over the row, the end at grade.
    const waypoints = routeWaypoints([
      { endpoint: { kind: "cell", cell: cell(6, -1) }, cell: cell(6, -1) },
      {
        endpoint: { kind: "cell", cell: cell(13, -1, 1) },
        cell: cell(13, -1, 1),
      },
      { endpoint: { kind: "cell", cell: cell(13, 0) }, cell: cell(13, 0) },
    ]);
    // Mutant: travelling at grade then climbing gives (13,-1,0) first.
    expect(waypoints).toEqual([
      cell(6, -1, 1),
      cell(13, -1, 1),
      cell(13, 0, 1),
    ]);
  });

  it("turns after the longer plan axis", () => {
    // Mutant: always x first turns at (1,0) and runs the long way last.
    expect(
      routeWaypoints([
        { endpoint: { kind: "cell", cell: cell(0, 0) }, cell: cell(0, 0) },
        { endpoint: { kind: "cell", cell: cell(1, 5) }, cell: cell(1, 5) },
      ]),
    ).toEqual([cell(0, 5)]);
  });

  it("never doubles back through the body a port belongs to", () => {
    // A heat pump whose supply leaves +x at (1,5), feeding a tank inlet on
    // the -x face of (2,1): the inlet's approach cell (1,1) lies back
    // toward the pump, so both single-bend orders would run through the
    // tank or reverse out of the pump. The run goes up halfway, across,
    // then up into the inlet, and every cell is visited once.
    const waypoints = routeWaypoints([
      {
        endpoint: { kind: "port", symbol: "pac", port: "supply" },
        cell: cell(1, 5),
        side: "+x",
      },
      {
        endpoint: { kind: "port", symbol: "b", port: "primary_in" },
        cell: cell(2, 1),
        side: "-x",
      },
    ]);
    expect(waypoints).toEqual([cell(2, 5), cell(2, 3), cell(1, 3), cell(1, 1)]);
    const visited = [cell(1, 5), ...waypoints, cell(2, 1)].map(
      (c) => `${c.x},${c.y}`,
    );
    expect(new Set(visited).size).toBe(visited.length);
  });

  it("keeps a corner where a run turns back on itself", () => {
    // Mutant: a collinearity test on shared coordinates alone drops (0,3)
    // and the run collapses to nothing.
    expect(
      routeWaypoints([
        { endpoint: { kind: "cell", cell: cell(0, 0) }, cell: cell(0, 0) },
        { endpoint: { kind: "cell", cell: cell(0, 3) }, cell: cell(0, 3) },
        { endpoint: { kind: "cell", cell: cell(0, 1) }, cell: cell(0, 1) },
      ]),
    ).toEqual([cell(0, 3)]);
  });

  it("joins two facing ports in adjacent cells directly", () => {
    // Each port's step out lands in the other's cell; the run must not
    // go out and straight back. Mutant: keeping the spike stores an
    // A-B-A-B zigzag the backend accepts and the renderer draws doubled.
    expect(
      routeWaypoints([
        {
          endpoint: { kind: "port", symbol: "a", port: "out" },
          cell: cell(0, 0),
          side: "+x",
        },
        {
          endpoint: { kind: "port", symbol: "b", port: "in" },
          cell: cell(1, 0),
          side: "-x",
        },
      ]),
    ).toEqual([]);
  });

  it("steps aside rather than run back through the body on a straight line", () => {
    // pac-01's supply leaves +x from (1,1); the author clicks (-2,1) on the
    // same row, behind the pump. Mutant: a plain straight run crosses the
    // pump's own cells (1,1) and (0,1) and the plate draws a pipe through it.
    const waypoints = routeWaypoints([
      {
        endpoint: { kind: "port", symbol: "pac", port: "supply" },
        cell: cell(1, 1),
        side: "+x",
      },
      { endpoint: { kind: "cell", cell: cell(-2, 1) }, cell: cell(-2, 1) },
    ]);
    expect(waypoints).toEqual([cell(2, 1), cell(2, 2), cell(-2, 2)]);
  });

  it("drops corners a straight run does not need", () => {
    expect(
      routeWaypoints([
        { endpoint: { kind: "cell", cell: cell(0, 0) }, cell: cell(0, 0) },
        { endpoint: { kind: "cell", cell: cell(3, 0) }, cell: cell(3, 0) },
      ]),
    ).toEqual([]);
  });

  it("leaves and enters through the declared faces for every side pair and small offset", () => {
    // The invariant the router exists for, held against the backend's own
    // rules: every segment moves along one axis and is not empty, the first
    // leaves the start port through its face, the last reaches the end port
    // through its face. Sweeping the four in-plane faces against offsets in
    // ±6 covers the two-symbol layouts an author actually draws.
    const sides: Side[] = ["+x", "-x", "+y", "-y"];
    const port = (id: string, at: Cell, side: Side): RoutePoint => ({
      endpoint: { kind: "port", symbol: id, port: "p" },
      cell: at,
      side,
    });
    const direction = (a: Cell, b: Cell): string => {
      const d = { x: b.x - a.x, y: b.y - a.y, z: (b.z ?? 0) - (a.z ?? 0) };
      const axes = (["x", "y", "z"] as const).filter((k) => d[k] !== 0);
      if (axes.length !== 1) return "diagonal or empty";
      const k = axes[0];
      return `${d[k] > 0 ? "+" : "-"}${k}`;
    };
    const failures: string[] = [];
    for (const s1 of sides) {
      for (const s2 of sides) {
        for (let dx = -6; dx <= 6; dx++) {
          for (let dy = -6; dy <= 6; dy++) {
            if (dx === 0 && dy === 0) continue;
            const a = cell(0, 0);
            const b = cell(dx, dy);
            const run = [
              a,
              ...routeWaypoints([port("a", a, s1), port("b", b, s2)]),
              b,
            ];
            const first = direction(run[0], run[1]);
            const last = direction(run[run.length - 1], run[run.length - 2]);
            const broken = run.some(
              (c, i) =>
                i > 0 && direction(run[i - 1], c) === "diagonal or empty",
            );
            if (first !== s1 || last !== s2 || broken) {
              failures.push(
                `${s1} -> (${dx},${dy}) ${s2}: leaves ${first}, arrives ${last}, ` +
                  `${broken ? "broken segment" : "segments fine"} via ${JSON.stringify(run.slice(1, -1))}`,
              );
            }
          }
        }
      }
    }
    // Mutant: the halving that lands on the start cell, or the spike pass
    // deleting a port's step cell, each hand the backend a
    // port_side_mismatch on 64 of these 2688 pairs.
    expect(failures).toEqual([]);
  });
});

describe("defaultProps", () => {
  it("seeds every required prop with the value the inspector shows for it", () => {
    // Mutant: an empty props object displays as a valid collector and is
    // refused at save as invalid_props with no field named.
    expect(defaultProps("collector")).toEqual({
      axis: "x",
      length: 2,
      ports: {},
    });
    // The one empty string the type accepts, so a fresh tank saves.
    expect(defaultProps("tank")).toEqual({ capacity: "" });
    // Optional props keep the backend's own defaults.
    expect(defaultProps("link")).toEqual({});
    expect(defaultProps("pump")).toEqual({});
    expect(defaultProps("no_such_type")).toEqual({});
  });
});

describe("attachedPorts", () => {
  it("names the ports of a symbol a run starts or ends on", () => {
    const doc = toDocument(PLATE);
    expect([...attachedPorts(doc, "collector-supply")].sort()).toEqual([
      "in_1",
      "in_2",
      "out_1",
      "out_2",
    ]);
    // A port endpoint on another symbol, or a free cell, is not this one's.
    expect(attachedPorts(doc, "b01").has("primary_in")).toBe(true);
    expect(attachedPorts(doc, "nope").size).toBe(0);
  });
});

describe("removeSymbol", () => {
  it("keeps the runs on its ports as free cells", () => {
    const doc = removeSymbol(toDocument(PLATE), "pac-01");
    expect(doc.symbols!.some((s) => s.id === "pac-01")).toBe(false);
    const supply = pipe(doc, "pac-01-supply");
    // Mutant: dropping the run with the symbol leaves the tank unfed.
    expect(supply.from).toEqual({ kind: "cell", cell: { x: 1, y: 1, z: 0 } });
    expect(supply.to.kind).toBe("port");
  });
});

describe("removePipe", () => {
  it("removes the symbols riding it and frees the tees off it", () => {
    const before = toDocument(PLATE);
    const trunk = before.pipes!.find((p) =>
      before.pipes!.some((q) => q.from.kind === "pipe" && q.from.pipe === p.id),
    )!;
    const branch = before.pipes!.find(
      (q) => q.from.kind === "pipe" && q.from.pipe === trunk.id,
    )!;
    const riders = before.symbols!.filter(
      (s) => s.placement.kind === "pipe" && s.placement.pipe === trunk.id,
    );
    const doc = removePipe(before, trunk.id);
    expect(doc.pipes!.some((p) => p.id === trunk.id)).toBe(false);
    expect(doc.symbols!.filter((s) => riders.includes(s))).toHaveLength(0);
    const teeCell = (branch.from as { cell: Cell }).cell;
    expect(pipe(doc, branch.id).from).toEqual({ kind: "cell", cell: teeCell });
  });
});

describe("moveSymbol", () => {
  it("moves the origin and leaves every waypoint where it was", () => {
    const before = toDocument(PLATE);
    const doc = moveSymbol(before, "pac-01", { x: 0, y: 1, z: 0 });
    expect(doc.symbols![0].placement.cell).toEqual({ x: 0, y: 1, z: 0 });
    expect(pipe(doc, "pac-01-supply").waypoints).toEqual(
      pipe(before, "pac-01-supply").waypoints,
    );
  });

  it("does not move an inline symbol off its run", () => {
    const before = toDocument(PLATE);
    const inline = before.symbols!.find((s) => s.placement.kind === "pipe")!;
    expect(moveSymbol(before, inline.id, { x: 99, y: 99 })).toEqual(before);
  });
});

describe("rotateSymbol", () => {
  it("turns a free symbol a quarter and leaves a rotation-locked type alone", () => {
    const before = toDocument(PLATE);
    const turned = rotateSymbol(before, "pac-01");
    expect(turned.symbols![0].placement).toMatchObject({ rotation: 1 });
    const collector = before.symbols!.find((s) => s.type === "collector")!;
    // Mutant: rotating the collector is refused at save as rotation_locked.
    expect(rotateSymbol(before, collector.id)).toEqual(before);
  });
});

describe("emptyDocument", () => {
  it("opens on the view the author chose, isometric unless told", () => {
    expect(emptyDocument("p").projection).toBe("isometric");
    expect(emptyDocument("p", "flat").projection).toBe("flat");
  });
});

describe("duplicateSymbol", () => {
  const base = (): PlateDocument => ({
    ...emptyDocument("p"),
    symbols: [
      {
        id: "tank-1",
        type: "tank",
        label: "B1",
        device_id: "dev-1",
        placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation: 1 },
        props: { capacity: "500 L" },
        bindings: { temperature: { kind: "text", text: "55" } },
      },
    ],
  });

  it("copies the type, props and rotation, not the device, label or bindings", () => {
    const result = duplicateSymbol(base(), "tank-1")!;
    const copy = result.doc.symbols!.find((s) => s.id === result.id)!;
    expect(result.id).toBe("tank-2");
    expect(copy).toMatchObject({
      type: "tank",
      props: { capacity: "500 L" },
      label: null,
      device_id: null,
      bindings: {},
    });
    expect(copy.placement).toMatchObject({ kind: "cell", rotation: 1 });
  });

  it("stands the copy clear of its original's turned footprint", () => {
    // A tank turned a quarter spans x -1..0, two cells wide: the copy's
    // origin goes three cells right, so it spans x 2..3 and x 1 stays
    // empty between the two.
    const result = duplicateSymbol(base(), "tank-1")!;
    const copy = result.doc.symbols!.find((s) => s.id === result.id)!;
    expect(copy.placement.cell).toEqual({ x: 3, y: 0 });
  });

  it("pushes the copy further right when a body stands there", () => {
    const doc = base();
    doc.symbols!.push({
      id: "e",
      type: "plate_exchanger",
      placement: { kind: "cell", cell: { x: 2, y: 0 }, rotation: 0 },
      props: {},
      bindings: {},
    });
    const result = duplicateSymbol(doc, "tank-1")!;
    const copy = result.doc.symbols!.find((s) => s.id === result.id)!;
    expect(copy.placement.cell).toEqual({ x: 6, y: 0 });
  });

  it("does not copy a symbol riding a run", () => {
    const doc = toDocument(PLATE);
    const inline = doc.symbols!.find((s) => s.placement.kind === "pipe")!;
    expect(duplicateSymbol(doc, inline.id)).toBeNull();
    expect(duplicateSymbol(doc, "nope")).toBeNull();
  });
});

describe("setCollectorAxis", () => {
  const collector = (axis: "x" | "y"): PlateDocument => ({
    ...emptyDocument("p"),
    symbols: [
      {
        id: "c",
        type: "collector",
        placement: { kind: "cell", cell: { x: 0, y: 0 }, rotation: 0 },
        props: {
          axis,
          length: 4,
          ports: {
            in_1: { offset: 0, side: "-x" },
            out_1: { offset: 2, side: "-y" },
            out_2: { offset: 3, side: "+z" },
          },
        },
        bindings: {},
      },
    ],
  });
  const props = (doc: PlateDocument) => doc.symbols![0].props;

  it("turns the ports with the bar and keeps their offsets", () => {
    expect(props(setCollectorAxis(collector("x"), "c", "y"))).toEqual({
      axis: "y",
      length: 4,
      ports: {
        in_1: { offset: 0, side: "-y" },
        out_1: { offset: 2, side: "+x" },
        out_2: { offset: 3, side: "+z" },
      },
    });
  });

  it("gives the collector back as it was when switched twice", () => {
    const before = collector("x");
    const twice = setCollectorAxis(
      setCollectorAxis(before, "c", "y"),
      "c",
      "x",
    );
    // Mutant: turning the same way both times points every port backwards.
    expect(props(twice)).toEqual(props(before));
  });

  it("leaves a collector already on that axis alone", () => {
    const before = collector("y");
    expect(setCollectorAxis(before, "c", "y")).toEqual(before);
  });
});

describe("hasRaisedElements", () => {
  it("is false for a plate at the floor", () => {
    expect(hasRaisedElements(emptyDocument("p"))).toBe(false);
  });

  it("sees a raised waypoint, as on the committed plates", () => {
    expect(hasRaisedElements(toDocument(PLATE))).toBe(true);
  });

  it("sees a collector port facing up, which only a raised run reaches", () => {
    const doc: PlateDocument = {
      ...emptyDocument("p"),
      symbols: [
        {
          id: "c",
          type: "collector",
          placement: { kind: "cell", cell: { x: 0, y: 0 } },
          props: {
            axis: "x",
            length: 2,
            ports: { in_1: { offset: 0, side: "+z" } },
          },
          bindings: {},
        },
      ],
    };
    expect(hasRaisedElements(doc)).toBe(true);
  });
});

describe("boundDevice", () => {
  const reading = (devices: Record<string, unknown>) => ({
    kind: "attribute" as const,
    target: { devices, attribute: "speed" },
  });

  it("names the device a binding reads by id alone", () => {
    expect(boundDevice(reading({ ids: ["d1"] }))).toBe("d1");
  });

  it("names none for a filter, several ids, a literal or nothing", () => {
    expect(boundDevice(reading({ ids: ["d1", "d2"] }))).toBeNull();
    expect(boundDevice(reading({ ids: ["d1"], types: ["pump"] }))).toBeNull();
    expect(
      boundDevice(reading({ ids: ["d1"], tags: { site: ["a"] } })),
    ).toBeNull();
    expect(boundDevice(reading({ types: ["pump"] }))).toBeNull();
    expect(boundDevice({ kind: "text", text: "55" })).toBeNull();
    expect(boundDevice(undefined)).toBeNull();
  });
});

describe("withDevice", () => {
  const pump: SymbolElement = {
    id: "pump-1",
    type: "pump",
    placement: { kind: "cell", cell: { x: 0, y: 0 } },
    device_id: "old",
    bindings: {
      state: {
        kind: "attribute",
        target: { devices: { ids: ["old"] }, attribute: "running" },
        labels: { true: "MARCHE" },
      },
      speed: {
        kind: "attribute",
        target: { devices: { ids: ["controller"] }, attribute: "speed" },
      },
    },
  };

  it("moves the bindings that read the old device to the new one, and those only", () => {
    const next = withDevice(pump, "new");
    expect(next.device_id).toBe("new");
    expect(next.bindings!.state).toEqual({
      kind: "attribute",
      target: { devices: { ids: ["new"] }, attribute: "running" },
      labels: { true: "MARCHE" },
    });
    // A reading from another device is the author's own choice: kept.
    expect(next.bindings!.speed).toBe(pump.bindings!.speed);
  });

  it("keeps every binding when the device is cleared or first set", () => {
    expect(withDevice(pump, null)).toEqual({ ...pump, device_id: null });
    const fresh = { ...pump, device_id: null };
    expect(withDevice(fresh, "d").bindings).toBe(fresh.bindings);
  });
});

describe("further cases, each pinned by a mutation", () => {
  const at = (x: number, y: number, z = 0): Cell => ({ x, y, z });
  const body = (
    id: string,
    type: string,
    cell: Cell,
    rotation = 0,
    props: Record<string, unknown> = {},
  ): SymbolElement => ({
    id,
    type,
    placement: { kind: "cell", cell, rotation },
    props,
    bindings: {},
  });
  const withSymbols = (symbols: SymbolElement[]): PlateDocument => ({
    ...emptyDocument("p"),
    symbols,
  });
  const copyOf = (result: { doc: PlateDocument; id: string }) =>
    result.doc.symbols!.find((s) => s.id === result.id)!;

  describe("duplicateSymbol", () => {
    // A 1 x 1 exchanger at the origin: each try moves the copy two cells
    // right, x = 2, 4, 6, ...
    const original = body("e", "plate_exchanger", at(0, 0));
    const blockers = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        body(`b${i}`, "plate_exchanger", at(2 * (i + 1), 0)),
      );

    it("tries eight places along the plan, the last one included", () => {
      // Seven places taken: the copy lands on the eighth, x = 16. Mutant:
      // one try fewer gives up here.
      const result = duplicateSymbol(
        withSymbols([original, ...blockers(7)]),
        "e",
      )!;
      expect(copyOf(result).placement.cell).toEqual(at(16, 0));
    });

    it("gives up when all eight are taken", () => {
      expect(
        duplicateSymbol(withSymbols([original, ...blockers(8)]), "e"),
      ).toBe(null);
    });

    it("stands the copy clear of a body that would cover only part of it", () => {
      // A 2 x 2 heat pump's first try is x 3..4; a 1 x 1 on (4,1) takes its
      // lower right cell, so the copy goes one try further, x 6..7.
      const pac = body("pac", "heat_pump", at(0, 0));
      const result = duplicateSymbol(
        withSymbols([pac, body("x", "plate_exchanger", at(4, 1))]),
        "pac",
      )!;
      expect(copyOf(result).placement.cell).toEqual(at(6, 0));
    });

    it("steps a collector by its bar, and keeps height and rotation", () => {
      const collector = body("c", "collector", at(0, 0, 2), 0, {
        axis: "x",
        length: 5,
        ports: { in_1: { offset: 0, side: "-x" } },
      });
      const result = duplicateSymbol(withSymbols([collector]), "c")!;
      expect(copyOf(result).placement).toEqual({
        kind: "cell",
        cell: at(6, 0, 2),
        rotation: 0,
      });
      expect(copyOf(result).props).toEqual(collector.props);
    });

    it("takes an id no pipe, tag or label uses, and leaves the plate it read alone", () => {
      const doc: PlateDocument = {
        ...withSymbols([original]),
        pipes: [
          {
            id: "plate_exchanger-1",
            fluid: "dhw",
            from: { kind: "cell", cell: at(0, 5) },
            to: { kind: "cell", cell: at(3, 5) },
            tags: [{ id: "plate_exchanger-2", at: at(1, 5), label: "T" }],
          },
        ],
        labels: [
          {
            id: "plate_exchanger-3",
            at: { x: 0, y: 8 },
            text: "",
            role: "note",
          },
        ],
      };
      const snapshot = JSON.stringify(doc);
      const result = duplicateSymbol(doc, "e")!;
      expect(result.id).toBe("plate_exchanger-4");
      expect(JSON.stringify(doc)).toBe(snapshot);
      expect(result.doc.symbols).toHaveLength(2);
    });
  });

  describe("setCollectorAxis", () => {
    it("leaves a symbol without props alone", () => {
      const bare: SymbolElement = {
        id: "c",
        type: "collector",
        placement: { kind: "cell", cell: at(0, 0) },
      };
      const doc = withSymbols([bare]);
      expect(setCollectorAxis(doc, "c", "y").symbols![0]).toBe(bare);
    });

    it("turns every in-plane face the same way and keeps the vertical ones", () => {
      const collector = body("c", "collector", at(0, 0), 0, {
        axis: "y",
        length: 4,
        ports: {
          a: { offset: 0, side: "+x" },
          b: { offset: 1, side: "+y" },
          c: { offset: 2, side: "-x" },
          d: { offset: 3, side: "-y" },
          e: { offset: 3, side: "-z" },
        },
      });
      const turned = setCollectorAxis(withSymbols([collector]), "c", "x");
      // From y back to x: a quarter turn clockwise, +x -> -y.
      expect(turned.symbols![0].props).toEqual({
        axis: "x",
        length: 4,
        ports: {
          a: { offset: 0, side: "-y" },
          b: { offset: 1, side: "+x" },
          c: { offset: 2, side: "+y" },
          d: { offset: 3, side: "-x" },
          e: { offset: 3, side: "-z" },
        },
      });
    });
  });

  describe("hasRaisedElements", () => {
    const run = {
      id: "r",
      fluid: "dhw" as const,
      from: { kind: "cell" as const, cell: at(0, 0) },
      to: { kind: "cell" as const, cell: at(3, 0) },
      waypoints: [],
      tags: [],
    };
    const doc = (extra: Partial<PlateDocument>): PlateDocument => ({
      ...emptyDocument("p"),
      ...extra,
    });

    it.each([
      ["a raised symbol", doc({ symbols: [body("s", "tank", at(0, 0, 1))] })],
      [
        "a raised free end",
        doc({ pipes: [{ ...run, to: { kind: "cell", cell: at(3, 0, 1) } }] }),
      ],
      [
        "a raised tag",
        doc({
          pipes: [{ ...run, tags: [{ id: "t", at: at(1, 0, 1), label: "" }] }],
        }),
      ],
      [
        "a raised label",
        doc({
          labels: [
            { id: "l", at: { x: 0, y: 0, z: 0.5 }, text: "", role: "note" },
          ],
        }),
      ],
      [
        "a collector port facing down",
        doc({
          symbols: [
            body("c", "collector", at(0, 0), 0, {
              axis: "x",
              length: 2,
              ports: { out_1: { offset: 1, side: "-z" } },
            }),
          ],
        }),
      ],
    ])("sees %s", (_, plate) => {
      expect(hasRaisedElements(plate)).toBe(true);
    });

    it("reads a run's port end as having no height of its own", () => {
      // A port end carries no cell: its height is its symbol's, read above.
      const pac = body("pac", "heat_pump", at(0, 0));
      expect(
        hasRaisedElements(
          doc({
            symbols: [pac],
            pipes: [
              {
                ...run,
                from: { kind: "port", symbol: "pac", port: "supply" },
                to: { kind: "cell", cell: at(5, 1) },
              },
            ],
          }),
        ),
      ).toBe(false);
    });
  });

  describe("boundDevice", () => {
    const reading = (devices: Record<string, unknown> | undefined): SlotValue =>
      ({
        kind: "attribute",
        target: { devices, attribute: "speed" },
      }) as SlotValue;

    it("names none for a binding narrowed to a driver", () => {
      // Mutant: ignoring the driver would move a binding the author pinned to
      // one driver along with the device.
      expect(
        boundDevice(reading({ ids: ["d1"], driver_id: "drv" })),
      ).toBeNull();
    });

    it("reads an empty tag filter as no filter", () => {
      expect(boundDevice(reading({ ids: ["d1"], tags: {} }))).toBe("d1");
      expect(boundDevice(reading({ ids: ["d1"], types: [] }))).toBe("d1");
    });

    it("names none without devices or with no id", () => {
      expect(boundDevice(reading(undefined))).toBeNull();
      expect(boundDevice(reading({ ids: [] }))).toBeNull();
      expect(boundDevice(null)).toBeNull();
    });
  });

  describe("withDevice", () => {
    const pump: SymbolElement = {
      id: "p",
      type: "pump",
      placement: { kind: "cell", cell: at(0, 0) },
      device_id: "old",
      bindings: {
        filtered: {
          kind: "attribute",
          target: {
            devices: { ids: ["old"], types: ["pump"] },
            attribute: "x",
          },
        },
        literal: { kind: "text", text: "MARCHE" },
      },
    };

    it("keeps a binding that reads the old device through a filter, and a literal", () => {
      const next = withDevice(pump, "new");
      expect(next.device_id).toBe("new");
      expect(next.bindings!.filtered).toBe(pump.bindings!.filtered);
      expect(next.bindings!.literal).toBe(pump.bindings!.literal);
    });

    it("changes nothing but the device when it is the same one", () => {
      const next = withDevice(pump, "old");
      expect(next).toEqual(pump);
      expect(next.bindings).toBe(pump.bindings);
    });
  });
});
