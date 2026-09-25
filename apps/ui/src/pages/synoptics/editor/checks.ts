import { symbolSchemas } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic/SynopticRenderer";
import { runViolations, type RunRule } from "./runRules";
import { describeError, type SaveErrors } from "./saveErrors";
import { pipeOverlaps } from "./occupancy";

/**
 * One thing worth looking at before a save, and never a reason not to
 * save: the backend is the judge, and some plates are saved half done on
 * purpose.
 *
 * - `saved`: what the last save refused, on an element or on the plate;
 * - `rule`: a run the backend would refuse, found before asking it;
 * - `unbound`: a symbol that could show readings and shows none, having
 *   neither a device nor a single bound slot.
 */
export type Check =
  | {
      kind: "saved";
      severity: "error";
      element: string | null;
      message: string;
    }
  | { kind: "rule"; severity: "error"; element: string; rule: RunRule }
  | {
      kind: "overlap";
      severity: "warning";
      element: string;
      other: string;
      count: number;
    }
  | { kind: "binding"; severity: "warning"; element: string; slot: string }
  | { kind: "unbound"; severity: "warning"; element: string };

/** The checks of a plate, errors first, one per element: the first thing
 *  wrong with it is what the author fixes next. */
export function plateChecks(doc: PlateDocument, errors: SaveErrors): Check[] {
  const checks: Check[] = errors.document.map((error) => ({
    kind: "saved",
    severity: "error",
    element: null,
    message: describeError(error),
  }));
  const named = new Set<string>();
  for (const [element, list] of errors.byElement) {
    named.add(element);
    checks.push({
      kind: "saved",
      severity: "error",
      element,
      message: describeError(list[0]),
    });
  }
  for (const { element, rule } of runViolations(doc)) {
    if (named.has(element)) continue;
    named.add(element);
    checks.push({ kind: "rule", severity: "error", element, rule });
  }
  for (const {
    pipes: [element, other],
    cells,
  } of pipeOverlaps(doc)) {
    checks.push({
      kind: "overlap",
      severity: "warning",
      element,
      other,
      count: cells.size,
    });
  }
  for (const symbol of doc.symbols ?? []) {
    const bindings = Object.entries(symbol.bindings ?? {});
    for (const [slot, binding] of bindings) {
      if (binding.kind === "attribute" && !binding.target.attribute.trim()) {
        checks.push({
          kind: "binding",
          severity: "warning",
          element: symbol.id,
          slot,
        });
      }
    }
    const slots = symbolSchemas[symbol.type]?.["x-slots"] ?? [];
    if (!slots.length || symbol.device_id) continue;
    if (
      bindings.some(
        ([, slot]) => slot.kind === "text" || slot.target.attribute.trim(),
      )
    )
      continue;
    checks.push({ kind: "unbound", severity: "warning", element: symbol.id });
  }
  return checks;
}
