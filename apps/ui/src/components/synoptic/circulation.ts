import {
  symbolSchemas,
  type PipeElement,
  type SymbolElement,
} from "@gridone/sdk";
import { portsOf, type CollectorProps } from "./symbols/ports";
import {
  flowSlotKey,
  stateOf,
  symbolSlotKey,
  truthOf,
  type SynopticValues,
} from "./values";

/** Where the fluid meets inside a symbol: one passage of one instance. */
const junction = (symbolId: string, passage: number | string) =>
  `${symbolId}#${passage}`;

/** Every run reached from `start` along `edges`, never entering `closed`. */
function reach(
  start: Iterable<string>,
  edges: Map<string, Set<string>>,
  closed: ReadonlySet<string>,
): Set<string> {
  const seen = new Set([...start].filter((run) => !closed.has(run)));
  const queue = [...seen];
  while (queue.length > 0) {
    for (const next of edges.get(queue.shift()!) ?? []) {
      if (seen.has(next) || closed.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * The runs of a plate the fluid is moving through: every run whose own
 * `flow` reads true, and every run on a path of the fluid through one.
 *
 * A run is drawn from where its fluid comes to where it goes (`from`, `to`),
 * so a path only ever walks that way: from a run into the runs that start
 * on it (a tee) or that it ends on, and through a symbol from a run that
 * arrives on a port to the runs that leave by a port of the same passage of
 * the registry (a heat pump's return to its supply; a tank's primary and
 * its domestic side apart; every port of a collector). The fluid enters the
 * plate where a run starts in the open or on a passage nothing arrives at
 * on the plate, and leaves it where a run ends in the open or on a passage
 * nothing leaves by: the plate does not draw the rest. A run moves when a
 * path from where the fluid enters to where it leaves passes through it and
 * through a flowing run. So a loop moves whole from one flowing run; the
 * inlets of a mixing valve move with its flowing outlet; and a branch whose
 * supply is stopped does not move by its return, which the collector it
 * drains into cannot feed back.
 *
 * Where runs simply join (a tee, a collector) they carry one fluid: a run
 * of another fluid meeting them is a feed or a changeover crossover (a
 * make-up line on a return collector, chilled water teed into a heating
 * line), which does not move with the circuit. Through a machine the fluid
 * changes name as it should (a heat pump's return leaves as its supply).
 *
 * A run is stopped, and no path enters it, when its own `flow` reads false,
 * when a machine or valve that gates the flow and reads off sits inline on
 * it, or when an end is on a port in no passage: a dead end (an expansion
 * vessel's). A machine or valve that gates the flow and reads off at a
 * run's end closes its passage, so the run moves only if the fluid can
 * leave it some other way (a tee). Only a known reading counts: a stale or
 * unknown `flow` starts nothing, a stale or unknown state stops nothing.
 * Nothing is inferred from an inline pump that runs, which would move the
 * return of a loop whose pump is on the supply: a pump can only stop the
 * fluid. A run whose own `flow` reads true moves whatever stands around it,
 * since its own signal says so.
 */
export function circulatingRuns(
  symbols: Iterable<SymbolElement>,
  pipes: readonly PipeElement[],
  values: SynopticValues,
): Set<string> {
  const byId = new Map([...symbols].map((symbol) => [symbol.id, symbol]));
  const runs = new Map(pipes.map((pipe) => [pipe.id, pipe]));

  const shut = (symbolId: string) => {
    const symbol = byId.get(symbolId);
    return (
      !!symbol &&
      !!symbolSchemas[symbol.type]?.["x-gates-flow"] &&
      stateOf(values.slots[symbolSlotKey(symbolId, "state")]) === "off"
    );
  };
  // The passage a port opens on for a run of `fluid`, or null for a dead
  // end (a port in no passage, or on a symbol or type the plate does not
  // know).
  const passageOf = (
    symbolId: string,
    port: string,
    fluid: string,
  ): string | null => {
    const symbol = byId.get(symbolId);
    const passages = symbol && symbolSchemas[symbol.type]?.["x-passages"];
    if (!symbol || !passages) return null;
    if (passages === "all") {
      const ports = portsOf(symbol.type, symbol.props as CollectorProps);
      return port in ports ? junction(symbolId, `all:${fluid}`) : null;
    }
    const index = passages.findIndex((passage) => passage.includes(port));
    return index < 0 ? null : junction(symbolId, index);
  };
  const flowOf = (pipe: PipeElement) => {
    const reading = pipe.flow ? values.slots[flowSlotKey(pipe.id)] : undefined;
    return !reading || reading.stale ? undefined : truthOf(reading.raw);
  };

  const inline = new Map<string, string[]>();
  for (const symbol of byId.values()) {
    if (symbol.placement.kind !== "pipe") continue;
    const on = inline.get(symbol.placement.pipe) ?? [];
    inline.set(symbol.placement.pipe, [...on, symbol.id]);
  }

  // The runs the fluid leaving each run enters, and the reverse.
  const down = new Map<string, Set<string>>();
  const up = new Map<string, Set<string>>();
  const feeds = (from: string, into: string) => {
    down.set(from, (down.get(from) ?? new Set()).add(into));
    up.set(into, (up.get(into) ?? new Set()).add(from));
  };
  const arriving = new Map<string, string[]>();
  const leaving = new Map<string, string[]>();
  const shutAt = new Set<string>();
  const stopped = new Set<string>();
  const openStart = new Set<string>();
  const openEnd = new Set<string>();
  for (const pipe of pipes) {
    if (flowOf(pipe) === false || (inline.get(pipe.id) ?? []).some(shut)) {
      stopped.add(pipe.id);
    }
    for (const [end, side, open] of [
      [pipe.from, leaving, openStart],
      [pipe.to, arriving, openEnd],
    ] as const) {
      if (end.kind === "cell") {
        open.add(pipe.id);
      } else if (end.kind === "pipe") {
        const host = runs.get(end.pipe);
        if (host?.fluid !== pipe.fluid) continue;
        if (side === leaving) feeds(host.id, pipe.id);
        else feeds(pipe.id, host.id);
      } else {
        const at = passageOf(end.symbol, end.port, pipe.fluid);
        if (at === null) {
          stopped.add(pipe.id);
          continue;
        }
        side.set(at, [...(side.get(at) ?? []), pipe.id]);
        if (shut(end.symbol)) shutAt.add(at);
      }
    }
  }
  // Through each open passage; one with nothing on a side lets the fluid in
  // or out of the plate there, and a shut one does neither.
  for (const at of new Set([...arriving.keys(), ...leaving.keys()])) {
    if (shutAt.has(at)) continue;
    const ins = arriving.get(at) ?? [];
    const outs = leaving.get(at) ?? [];
    if (outs.length === 0) ins.forEach((run) => openEnd.add(run));
    if (ins.length === 0) outs.forEach((run) => openStart.add(run));
    for (const run of ins) for (const out of outs) feeds(run, out);
  }

  const seeds = pipes
    .filter((pipe) => flowOf(pipe) === true)
    .map((pipe) => pipe.id);
  // A seed moves whatever surrounds it; the rest lies on a path through one.
  const blocked = new Set([...stopped].filter((run) => !seeds.includes(run)));
  const downstream = reach(seeds, down, blocked);
  const upstream = reach(seeds, up, blocked);
  // What can reach where the fluid leaves (or a seed), and what the fluid
  // can reach from where it enters (or a seed).
  const drains = reach([...seeds, ...openEnd], up, blocked);
  const fed = reach([...seeds, ...openStart], down, blocked);
  return new Set([
    ...seeds,
    ...[...downstream].filter((run) => drains.has(run)),
    ...[...upstream].filter((run) => fed.has(run)),
  ]);
}
