import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  symbolSchemas,
  type AttributeSlot,
  type PipeElement,
  type SymbolElement,
  type Synoptic,
} from "@gridone/sdk";
import { circulatingRuns } from "./circulation";
import {
  stateOf,
  truthOf,
  type SlotReading,
  type SynopticValues,
} from "./values";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const SLOT: AttributeSlot = {
  kind: "attribute",
  target: { devices: { ids: ["dev"] }, attribute: "flow" },
};

type End = PipeElement["from"];
const free = (x = 0, y = 0): End => ({ kind: "cell", cell: { x, y } });
const port = (symbol: string, name: string): End => ({
  kind: "port",
  symbol,
  port: name,
});
const tee = (pipe: string): End => ({
  kind: "pipe",
  pipe,
  cell: { x: 0, y: 0 },
});

const sym = (
  id: string,
  type: string,
  extra: Partial<SymbolElement> = {},
): SymbolElement =>
  ({
    id,
    type,
    placement: { kind: "cell", cell: { x: 0, y: 0 } },
    ...extra,
  }) as SymbolElement;
const onRun = (id: string, type: string, pipe: string): SymbolElement =>
  sym(id, type, {
    placement: { kind: "pipe", pipe, cell: { x: 0, y: 0 } },
  } as Partial<SymbolElement>);
const collector = (id: string, ports: string[]): SymbolElement =>
  sym(id, "collector", {
    props: {
      axis: "x",
      length: ports.length + 1,
      ports: Object.fromEntries(
        ports.map((name, i) => [name, { offset: i, side: "+y" }]),
      ),
    },
  });

const run = (
  id: string,
  fluid: string,
  from: End,
  to: End,
  flow = false,
): PipeElement =>
  ({
    id,
    fluid,
    from,
    to,
    waypoints: [],
    tags: [],
    ...(flow ? { flow: SLOT } : {}),
  }) as PipeElement;

const reading = (raw: SlotReading["raw"], stale = false): SlotReading => ({
  text: null,
  unit: null,
  raw,
  stale,
  faulty: false,
});
const flow = (pipe: string) => `pipe.${pipe}.flow`;
const state = (symbol: string) => `symbol.${symbol}.state`;
const vals = (slots: Record<string, SlotReading> = {}): SynopticValues => ({
  slots,
  devices: {},
});

const moving = (
  symbols: SymbolElement[],
  pipes: PipeElement[],
  slots: Record<string, SlotReading> = {},
) => circulatingRuns(symbols, pipes, vals(slots));

// ---------------------------------------------------------------------------
// A heat pump charging a tank: the primary loop, and the tank's domestic
// side apart from it.
// ---------------------------------------------------------------------------

const HP = sym("hp", "heat_pump");
const TANK = sym("tank", "tank");
const SUP = run(
  "sup",
  "primary_supply",
  port("hp", "supply"),
  port("tank", "primary_in"),
  true,
);
const RET = run(
  "ret",
  "primary_return",
  port("tank", "primary_out"),
  port("hp", "return"),
  true,
);
const DHW_OUT = run("dhw-out", "dhw", port("tank", "dhw_out"), free(9, 0));
const DHW_IN = run(
  "dhw-in",
  "dhw_loop",
  free(9, 2),
  port("tank", "dhw_in"),
  true,
);
const LOOP_SYMBOLS = [HP, TANK];
const LOOP = [SUP, RET, DHW_OUT, DHW_IN];

describe("circulatingRuns", () => {
  it("moves nothing without a reading, and nothing on a still plate", () => {
    expect(moving(LOOP_SYMBOLS, LOOP).size).toBe(0);
    expect(moving([], []).size).toBe(0);
  });

  it("goes round the loop from one flowing run, through the tank's primary and the heat pump", () => {
    expect(
      moving(LOOP_SYMBOLS, LOOP, { [flow("sup")]: reading(true) }),
    ).toEqual(new Set(["sup", "ret"]));
    expect(
      moving(LOOP_SYMBOLS, LOOP, { [flow("ret")]: reading(true) }),
    ).toEqual(new Set(["sup", "ret"]));
  });

  it("keeps the tank's domestic side apart from its primary", () => {
    const set = moving(LOOP_SYMBOLS, LOOP, { [flow("sup")]: reading(true) });
    expect(set.has("dhw-out")).toBe(false);
    expect(set.has("dhw-in")).toBe(false);
    // And the other way round: the domestic loop flowing leaves the primary.
    expect(
      moving(LOOP_SYMBOLS, LOOP, { [flow("dhw-in")]: reading(true) }),
    ).toEqual(new Set(["dhw-in", "dhw-out"]));
  });

  it("reads the run state whatever type the device gives it", () => {
    for (const raw of [true, 1, "1", "on", "ON", " true "]) {
      expect(
        moving(LOOP_SYMBOLS, LOOP, { [flow("sup")]: reading(raw) }).has("ret"),
      ).toBe(true);
    }
    for (const raw of [false, 0, "0", "off", "auto", 2, null, "marche"]) {
      expect(
        moving(LOOP_SYMBOLS, LOOP, { [flow("sup")]: reading(raw) }).size,
      ).toBe(0);
    }
  });

  it("never enters a run whose own flow reads false, but moves every run whose own flow reads true", () => {
    expect(
      moving(LOOP_SYMBOLS, LOOP, {
        [flow("sup")]: reading(true),
        [flow("ret")]: reading(false),
      }),
    ).toEqual(new Set(["sup"]));
    expect(
      moving(LOOP_SYMBOLS, LOOP, {
        [flow("sup")]: reading(true),
        [flow("ret")]: reading("off"),
      }),
    ).toEqual(new Set(["sup"]));
  });

  it("starts nothing from a stale or unknown flow, and stops nothing with one", () => {
    expect(
      moving(LOOP_SYMBOLS, LOOP, { [flow("sup")]: reading(true, true) }).size,
    ).toBe(0);
    expect(
      moving(LOOP_SYMBOLS, LOOP, { [flow("sup")]: reading("auto") }).size,
    ).toBe(0);
    // A stale "no flow" on the return is no longer known: it stops nothing.
    expect(
      moving(LOOP_SYMBOLS, LOOP, {
        [flow("sup")]: reading(true),
        [flow("ret")]: reading(false, true),
      }),
    ).toEqual(new Set(["sup", "ret"]));
  });

  it("reads a run's flow only when the run binds one", () => {
    const unbound = run("unbound", "primary_supply", free(), free(3, 0));
    expect(
      moving([], [unbound], { [flow("unbound")]: reading(true) }).size,
    ).toBe(0);
  });

  it("stops a run ending on a machine that gates the flow and reads off, but not the flowing run itself", () => {
    const off = { [flow("sup")]: reading(true), [state("hp")]: reading(false) };
    expect(moving(LOOP_SYMBOLS, LOOP, off)).toEqual(new Set(["sup"]));
    // Its own reading says it moves, whatever stands at its end.
    expect(
      moving(LOOP_SYMBOLS, LOOP, { ...off, [flow("ret")]: reading(true) }),
    ).toEqual(new Set(["sup", "ret"]));
    // Running, unknown, stale or not a state at all: nothing stops.
    for (const r of [reading(true), reading("auto"), reading(false, true)]) {
      expect(
        moving(LOOP_SYMBOLS, LOOP, {
          [flow("sup")]: reading(true),
          [state("hp")]: r,
        }),
      ).toEqual(new Set(["sup", "ret"]));
    }
  });

  it("stops a run on which a gating symbol sits inline and reads off, and only then", () => {
    for (const type of ["pump", "pump_double", "valve_isolation"]) {
      const symbols = [...LOOP_SYMBOLS, onRun("g", type, "ret")];
      expect(
        moving(symbols, LOOP, {
          [flow("sup")]: reading(true),
          [state("g")]: reading(false),
        }),
      ).toEqual(new Set(["sup"]));
      expect(
        moving(symbols, LOOP, {
          [flow("sup")]: reading(true),
          [state("g")]: reading(true),
        }),
      ).toEqual(new Set(["sup", "ret"]));
      expect(
        moving(symbols, LOOP, {
          [flow("sup")]: reading(true),
          [state("g")]: reading(false, true),
        }),
      ).toEqual(new Set(["sup", "ret"]));
    }
  });

  it("lets a symbol that does not gate the flow read off without stopping the run", () => {
    // A loop heater off, a check valve, a meter, a control valve: the fluid
    // still goes through.
    for (const type of [
      "loop_heater",
      "valve_check",
      "valve_control",
      "energy_meter",
      "dirt_separator",
      "air_separator",
    ]) {
      expect(symbolSchemas[type]?.["x-gates-flow"]).toBe(false);
      const symbols = [...LOOP_SYMBOLS, onRun("x", type, "ret")];
      expect(
        moving(symbols, LOOP, {
          [flow("sup")]: reading(true),
          [state("x")]: reading(false),
        }),
      ).toEqual(new Set(["sup", "ret"]));
    }
    // A tank reads no state; a stray "off" on it stops nothing either.
    expect(
      moving(LOOP_SYMBOLS, LOOP, {
        [flow("sup")]: reading(true),
        [state("tank")]: reading(false),
      }),
    ).toEqual(new Set(["sup", "ret"]));
  });

  it("infers nothing from a pump that runs: a pump only ever stops the fluid", () => {
    const symbols = [...LOOP_SYMBOLS, onRun("p", "pump", "ret")];
    expect(moving(symbols, LOOP, { [state("p")]: reading(true) }).size).toBe(0);
    expect(moving(symbols, LOOP, { [state("hp")]: reading(true) }).size).toBe(
      0,
    );
  });

  it("goes no further than a stopped run, even when the circuit carries on past it", () => {
    const symbols = [sym("l1", "link"), sym("l2", "link")];
    const pipes = [
      run("a", "dhw", free(), port("l1", "in"), true),
      run("b", "dhw", port("l1", "out"), port("l2", "in"), true),
      run("c", "dhw", port("l2", "out"), free(5, 0)),
    ];
    expect(
      moving(symbols, pipes, {
        [flow("a")]: reading(true),
        [flow("b")]: reading(false),
      }),
    ).toEqual(new Set(["a"]));
    expect(moving(symbols, pipes, { [flow("a")]: reading(true) })).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  it("treats a port in no passage, an unknown symbol or type, and a collector port never authored as dead ends", () => {
    const symbols = [
      ...LOOP_SYMBOLS,
      sym("vessel", "expansion_vessel"),
      sym("odd", "not_a_type"),
      collector("col", ["a", "b"]),
    ];
    const pipes = [
      ...LOOP,
      run(
        "to-vessel",
        "primary_return",
        tee("ret"),
        port("vessel", "in"),
        true,
      ),
      run("to-ghost", "primary_return", tee("ret"), port("ghost", "in")),
      run("to-odd", "primary_return", tee("ret"), port("odd", "in")),
      run("to-drain", "primary_return", tee("ret"), port("tank", "drain")),
      run("to-col", "primary_return", tee("ret"), port("col", "zz")),
    ];
    expect(moving(symbols, pipes, { [flow("sup")]: reading(true) })).toEqual(
      new Set(["sup", "ret"]),
    );
    // A dead-end run whose own flow reads true still moves, alone: no path
    // of the fluid goes through a dead end.
    expect(
      moving(symbols, pipes, { [flow("to-vessel")]: reading(true) }),
    ).toEqual(new Set(["to-vessel"]));
  });

  it("carries the fluid across a tee the way the runs are drawn, and ignores a tee onto a run the plate does not have", () => {
    const pipes = [
      run("trunk", "dhw", free(), tee("main"), true),
      run("main", "dhw", free(0, 3), free(9, 3), true),
      run("branch", "dhw", tee("trunk"), free(0, 6)),
      run("orphan", "dhw", tee("nowhere"), free(0, 9), true),
    ];
    // Downstream of the trunk: the run it ends on, the branch that leaves it.
    expect(moving([], pipes, { [flow("trunk")]: reading(true) })).toEqual(
      new Set(["trunk", "main", "branch"]),
    );
    // The main moving brings the trunk that feeds it, not the branch the
    // trunk may or may not also feed.
    expect(moving([], pipes, { [flow("main")]: reading(true) })).toEqual(
      new Set(["trunk", "main"]),
    );
    expect(moving([], pipes, { [flow("orphan")]: reading(true) })).toEqual(
      new Set(["orphan"]),
    );
  });

  it("carries nothing across a tee between two fluids: a crossover is not the circuit", () => {
    const pipes = [
      run("heating", "heating_supply", free(), free(9, 0), true),
      run("chilled", "chilled_supply", free(0, 3), tee("heating")),
      run("tap", "chilled_supply", tee("heating"), free(0, 6)),
    ];
    expect(moving([], pipes, { [flow("heating")]: reading(true) })).toEqual(
      new Set(["heating"]),
    );
  });

  it("joins every port of a collector for runs of one fluid, and leaves a feed of another fluid out", () => {
    const symbols = [collector("col", ["r1", "r2", "r3", "feed"])];
    const pipes = [
      run("r1", "primary_return", free(), port("col", "r1"), true),
      run("r2", "primary_return", free(0, 2), port("col", "r2"), true),
      run("out", "primary_return", port("col", "r3"), free(0, 4)),
      run("make-up", "cold_water", free(0, 6), port("col", "feed"), true),
    ];
    // The collector drains the runs that arrive: one moving says nothing of
    // the others, and the fluid leaves by the run that starts on it.
    expect(moving(symbols, pipes, { [flow("r1")]: reading(true) })).toEqual(
      new Set(["r1", "out"]),
    );
    expect(
      moving(symbols, pipes, {
        [flow("r1")]: reading(true),
        [flow("r2")]: reading(true),
      }),
    ).toEqual(new Set(["r1", "r2", "out"]));
    // The feed flowing sets the loop going no more than the loop sets it.
    expect(
      moving(symbols, pipes, { [flow("make-up")]: reading(true) }),
    ).toEqual(new Set(["make-up"]));
  });

  it("mixes through a mixing valve and passes through a link, one passage each", () => {
    const symbols = [sym("mix", "mixing_valve"), sym("link", "link")];
    const pipes = [
      run("hot", "dhw", free(), port("mix", "hot_in")),
      run("cold", "cold_water", free(0, 2), port("mix", "cold_in")),
      run("mixed", "dhw", port("mix", "out"), port("link", "in"), true),
      run("away", "dhw", port("link", "out"), free(0, 4)),
    ];
    expect(moving(symbols, pipes, { [flow("mixed")]: reading(true) })).toEqual(
      new Set(["hot", "cold", "mixed", "away"]),
    );
  });

  it("keeps a plate exchanger's primary and secondary apart", () => {
    const symbols = [sym("hx", "plate_exchanger")];
    const pipes = [
      run("p-in", "primary_supply", free(), port("hx", "primary_in"), true),
      run("p-out", "primary_return", port("hx", "primary_out"), free(0, 2)),
      run("s-in", "heating_return", free(0, 4), port("hx", "secondary_in")),
      run(
        "s-out",
        "heating_supply",
        port("hx", "secondary_out"),
        free(0, 6),
        true,
      ),
    ];
    expect(moving(symbols, pipes, { [flow("p-in")]: reading(true) })).toEqual(
      new Set(["p-in", "p-out"]),
    );
    expect(moving(symbols, pipes, { [flow("s-out")]: reading(true) })).toEqual(
      new Set(["s-in", "s-out"]),
    );
  });

  it("does not depend on the order of the symbols or the runs", () => {
    const slots = { [flow("sup")]: reading(true) };
    const symbols = [...LOOP_SYMBOLS, onRun("g", "pump", "dhw-in")];
    const a = moving(symbols, LOOP, slots);
    const b = moving([...symbols].reverse(), [...LOOP].reverse(), slots);
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// The committed plates, over every combination of what their flows read.
// ---------------------------------------------------------------------------

const PLATES_DIR = resolve(
  import.meta.dirname,
  "../../../../../docs/specs/synoptic",
);
const plate = (name: string): Synoptic => ({
  ...JSON.parse(readFileSync(resolve(PLATES_DIR, `${name}.json`), "utf8")),
  id: name,
  metadata: {},
});
const PLATE_NAMES = [
  "ecs-est",
  "ecs-ouest",
  "production-chaud",
  "production-froid",
] as const;

/**
 * The rule the documentation states, written from it and not from the
 * module (a closure of who reaches whom, rather than walks). Runs are
 * walked the way they are drawn: into the run a run ends on and into a run
 * that starts on it, when both carry one fluid; through a passage from the
 * runs arriving to the runs leaving (a collector's passage per fluid). A
 * passage of a gating symbol reading off carries nothing and lets nothing
 * in or out. The fluid enters where a run starts in the open or on an open
 * passage nothing arrives at, and leaves where a run ends in the open or on
 * an open passage nothing leaves by. A run is stopped when its own flow
 * reads false, a gating symbol inline on it reads off, or an end is on a
 * port in no passage. A run moves when its own flow reads true, or when a
 * walk over runs that are not stopped goes from an entry (or a flowing run)
 * through it to an exit (or a flowing run), passing a flowing run.
 */
function rules(doc: Synoptic, values: SynopticValues) {
  const symbols = new Map((doc.symbols ?? []).map((s) => [s.id, s]));
  const pipes = doc.pipes ?? [];
  const byId = new Map(pipes.map((p) => [p.id, p]));
  const known = (r: SlotReading | undefined) =>
    r && !r.stale ? truthOf(r.raw) : undefined;
  const ownFlow = (p: PipeElement) =>
    p.flow ? known(values.slots[flow(p.id)]) : undefined;
  const gatesOff = (id: string) => {
    const s = symbols.get(id);
    return (
      !!s &&
      symbolSchemas[s.type]?.["x-gates-flow"] === true &&
      stateOf(values.slots[state(id)]) === "off"
    );
  };
  const passage = (end: End, fluid: string): string | null => {
    if (end.kind !== "port") return null;
    const s = symbols.get(end.symbol);
    const passages = s ? symbolSchemas[s.type]?.["x-passages"] : undefined;
    if (!s || !passages) return null;
    if (passages === "all") {
      const ports = (s.props as { ports?: Record<string, { offset: unknown }> })
        ?.ports;
      return typeof ports?.[end.port]?.offset === "number"
        ? `${s.id}|all|${fluid}`
        : null;
    }
    const i = passages.findIndex((group) => group.includes(end.port));
    return i < 0 ? null : `${s.id}|${i}`;
  };
  const inlineOn = (id: string) =>
    [...symbols.values()].filter(
      (s) => s.placement.kind === "pipe" && s.placement.pipe === id,
    );
  const seeds = new Set(
    pipes.filter((p) => ownFlow(p) === true).map((p) => p.id),
  );
  const stopped = new Set(
    pipes
      .filter(
        (p) =>
          ownFlow(p) === false ||
          inlineOn(p.id).some((s) => gatesOff(s.id)) ||
          [p.from, p.to].some(
            (end) => end.kind === "port" && passage(end, p.fluid) === null,
          ),
      )
      .map((p) => p.id),
  );
  const edges = new Map(pipes.map((p) => [p.id, new Set<string>()]));
  const ins = new Map<string, string[]>();
  const outs = new Map<string, string[]>();
  const shut = new Set<string>();
  const entries = new Set<string>();
  const exits = new Set<string>();
  for (const p of pipes) {
    if (p.from.kind === "cell") entries.add(p.id);
    if (p.to.kind === "cell") exits.add(p.id);
    const fromHost = p.from.kind === "pipe" ? byId.get(p.from.pipe) : null;
    if (fromHost?.fluid === p.fluid) edges.get(fromHost.id)!.add(p.id);
    const toHost = p.to.kind === "pipe" ? byId.get(p.to.pipe) : null;
    if (toHost?.fluid === p.fluid) edges.get(p.id)!.add(toHost.id);
    for (const [end, side] of [
      [p.from, outs],
      [p.to, ins],
    ] as const) {
      const at = passage(end, p.fluid);
      if (at === null) continue;
      side.set(at, [...(side.get(at) ?? []), p.id]);
      if (end.kind === "port" && gatesOff(end.symbol)) shut.add(at);
    }
  }
  for (const at of new Set([...ins.keys(), ...outs.keys()])) {
    if (shut.has(at)) continue;
    const a = ins.get(at) ?? [];
    const b = outs.get(at) ?? [];
    if (b.length === 0) a.forEach((id) => exits.add(id));
    if (a.length === 0) b.forEach((id) => entries.add(id));
    for (const x of a) for (const y of b) edges.get(x)!.add(y);
  }
  const blocked = (id: string) => stopped.has(id) && !seeds.has(id);
  const reaches = new Map<string, Set<string>>();
  for (const p of pipes) {
    const seen = new Set<string>();
    const walk = (id: string) => {
      if (seen.has(id) || blocked(id)) return;
      seen.add(id);
      edges.get(id)!.forEach(walk);
    };
    walk(p.id);
    reaches.set(p.id, seen);
  }
  const from = (a: string, b: string) => reaches.get(a)!.has(b);
  const moving = new Set(seeds);
  for (const p of pipes) {
    const r = p.id;
    if (blocked(r)) continue;
    for (const s of seeds) {
      const onward = from(s, r) && [...exits, ...seeds].some((x) => from(r, x));
      const inward =
        from(r, s) && [...entries, ...seeds].some((e) => from(e, r));
      if (onward || inward) moving.add(r);
    }
  }
  return { seeds, stopped, edges, moving };
}

/** The plate's readings that matter: the flows it binds and the states of
 *  the gating symbols it binds. */
function knobs(doc: Synoptic) {
  const flows = (doc.pipes ?? []).filter((p) => p.flow).map((p) => p.id);
  const gates = (doc.symbols ?? [])
    .filter((s) => symbolSchemas[s.type]?.["x-gates-flow"] && s.bindings?.state)
    .map((s) => s.id);
  return { flows, gates };
}

const FLOW_CHOICES: (SlotReading | undefined)[] = [
  undefined,
  reading(true),
  reading(false),
  reading(true, true),
];
const STATE_CHOICES: (SlotReading | undefined)[] = [
  undefined,
  reading(true),
  reading(false),
  reading(false, true),
];

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Every combination of flow readings, crossed with the gates all absent,
 *  all on, all off, each one off alone, then random draws of both. */
function* readings(doc: Synoptic, draws = 200) {
  const { flows, gates } = knobs(doc);
  const slotsOf = (
    f: (SlotReading | undefined)[],
    g: (SlotReading | undefined)[],
  ) => {
    const slots: Record<string, SlotReading> = {};
    flows.forEach((id, i) => f[i] && (slots[flow(id)] = f[i]!));
    gates.forEach((id, i) => g[i] && (slots[state(id)] = g[i]!));
    return slots;
  };
  const gateSets = [
    gates.map(() => undefined),
    gates.map(() => reading(true)),
    gates.map(() => reading(false)),
    ...gates.map((_, j) =>
      gates.map((__, i) => (i === j ? reading(false) : reading(true))),
    ),
  ];
  const combos = FLOW_CHOICES.length ** flows.length;
  for (let n = 0; n < combos; n++) {
    const f = flows.map(
      (_, i) =>
        FLOW_CHOICES[
          Math.floor(n / FLOW_CHOICES.length ** i) % FLOW_CHOICES.length
        ],
    );
    for (const g of gateSets) yield slotsOf(f, g);
  }
  const random = lcg(combos * 7919 + gates.length);
  for (let n = 0; n < draws; n++) {
    yield slotsOf(
      flows.map(() => FLOW_CHOICES[Math.floor(random() * 4)]),
      gates.map(() => STATE_CHOICES[Math.floor(random() * 4)]),
    );
  }
}

const circulate = (doc: Synoptic, slots: Record<string, SlotReading>) =>
  circulatingRuns(doc.symbols ?? [], doc.pipes ?? [], vals(slots));

describe("circulatingRuns on the committed plates", () => {
  it.each(PLATE_NAMES)(
    "%s: moves exactly the runs on a path of the fluid through a flowing run, never a stopped one",
    (name) => {
      const doc = plate(name);
      let cases = 0;
      let movedSomething = 0;
      let heldBack = 0;
      for (const slots of readings(doc)) {
        const set = circulate(doc, slots);
        const { seeds, stopped, edges, moving } = rules(doc, vals(slots));
        // Every run whose own flow reads true moves.
        for (const id of seeds) expect(set.has(id)).toBe(true);
        // Nothing stopped moves, unless its own flow says it does.
        for (const id of set) {
          if (!seeds.has(id)) expect(stopped.has(id)).toBe(false);
        }
        expect(set).toEqual(moving);
        for (const id of set) {
          for (const next of edges.get(id)!) {
            if (!set.has(next)) heldBack += 1;
          }
        }
        cases += 1;
        if (set.size > 0) movedSomething += 1;
      }
      // The sweep covers ground: many readings, many of them moving
      // something, and runs downstream of a moving one left still.
      expect(cases).toBeGreaterThan(200);
      expect(movedSomething).toBeGreaterThan(50);
      expect(heldBack).toBeGreaterThan(0);
    },
  );

  it.each(PLATE_NAMES)(
    "%s: a stale reading changes nothing an absent one would not",
    (name) => {
      const doc = plate(name);
      for (const slots of readings(doc, 100)) {
        const without = Object.fromEntries(
          Object.entries(slots).filter(([, r]) => !r.stale),
        );
        expect(circulate(doc, slots)).toEqual(circulate(doc, without));
      }
    },
  );

  it.each(PLATE_NAMES)(
    "%s: a gate opening or a flow starting never stills a run that moved",
    (name) => {
      const doc = plate(name);
      const { flows, gates } = knobs(doc);
      for (const slots of readings(doc, 100)) {
        const before = circulate(doc, slots);
        for (const id of gates) {
          if (slots[state(id)]?.raw !== false || slots[state(id)]?.stale)
            continue;
          const after = circulate(doc, {
            ...slots,
            [state(id)]: reading(true),
          });
          for (const run of before) expect(after.has(run)).toBe(true);
        }
        for (const id of flows) {
          const after = circulate(doc, { ...slots, [flow(id)]: reading(true) });
          for (const run of before) expect(after.has(run)).toBe(true);
        }
      }
    },
  );

  it.each(["ecs-est", "ecs-ouest"])(
    "%s: the domestic side and the cold-water make-up never move with the primary loop",
    (name) => {
      const doc = plate(name);
      const still = (doc.pipes ?? [])
        .filter((p) =>
          ["dhw", "dhw_loop", "cold_water"].includes(p.fluid as string),
        )
        .map((p) => p.id);
      expect(still).toContain("cold-main");
      expect(still).toContain("col-1-dhw-out");
      let loopMoved = 0;
      for (const slots of readings(doc)) {
        const set = circulate(doc, slots);
        for (const id of still) expect(set.has(id)).toBe(false);
        if (set.has("col-1-return")) loopMoved += 1;
      }
      expect(loopMoved).toBeGreaterThan(20);
    },
  );

  it("ecs-est: both heat pumps running carry the whole primary loop, and nothing else", () => {
    const doc = plate("ecs-est");
    const set = circulate(doc, {
      [flow("pac-03-supply")]: reading(true),
      [flow("pac-04-supply")]: reading(true),
      [state("pac-03")]: reading(true),
      [state("pac-04")]: reading(true),
    });
    expect([...set].sort()).toEqual(
      [
        "pac-03-supply",
        "pac-04-supply",
        "feed-col-1",
        "feed-col-2",
        "b01-b04",
        "b04-b07",
        "b02-b05",
        "b05-b08",
        "b08-b09",
        "col-1-return",
        "col-2-return",
        "col-3-return",
        "return-loop",
        "return-pac-04",
      ].sort(),
    );
  });

  it("ecs-est: a heat pump reading off stills its own supply; the return loop still carries the other's water to it", () => {
    const doc = plate("ecs-est");
    const set = circulate(doc, {
      [flow("pac-03-supply")]: reading(false),
      [flow("pac-04-supply")]: reading(true),
      [state("pac-03")]: reading(false),
      [state("pac-04")]: reading(true),
    });
    expect(set.has("pac-03-supply")).toBe(false);
    // Up to its tee to PAC 04, the return loop carries PAC 04's water.
    expect(set.has("return-loop")).toBe(true);
    expect(set.has("pac-04-supply")).toBe(true);
    expect(set.has("return-pac-04")).toBe(true);
    expect(set.has("col-1-return")).toBe(true);
  });

  // The kitchen branch is one series path, supply then return through the
  // off-plate link; closing its supply valve stops the water in both: the
  // return collector drains the return, it never feeds it.
  it("production-chaud: closing a branch's supply valve stills its return too", () => {
    const doc = plate("production-chaud");
    const set = circulate(doc, {
      [flow("pec-d2-a-branch")]: reading(true),
      [state("v-cuisine")]: reading(false),
    });
    expect(set.has("cuisine-depart")).toBe(false);
    expect(set.has("cuisine-retour")).toBe(false);
  });

  it("production-chaud: the secondary moves from its pump branches, the primary never, and a closed valve stills its branch", () => {
    const doc = plate("production-chaud");
    const set = circulate(doc, {
      [flow("pec-d2-a-branch")]: reading(true),
    });
    for (const id of [
      "sec-supply",
      "sec-supply-out",
      "cuisine-depart",
      "sec-return",
    ])
      expect(set.has(id)).toBe(true);
    for (const id of [
      "prim-supply",
      "prim-return",
      "vase-connection",
      "eg-balance",
    ])
      expect(set.has(id)).toBe(false);
    const closed = circulate(doc, {
      [flow("pec-d2-a-branch")]: reading(true),
      [state("v-cuisine")]: reading(false),
    });
    expect(closed.has("cuisine-depart")).toBe(false);
    expect(closed.has("vcv-rdc-depart")).toBe(true);
  });
});
