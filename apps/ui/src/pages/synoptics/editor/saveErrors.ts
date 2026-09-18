import type { ValidationErrorItem } from "@gridone/sdk";
import type { PlateDocument } from "@/components/synoptic";

/** One violation on an element: the path below the element (`["bindings",
 *  "state"]`, `["flow"]`, `["props"]`) and the message. */
export type ElementError = { path: (string | number)[]; msg: string };

/** The save-time violations of a plate, sorted to where the author can
 *  fix them: on the element a `loc` names, or on the document when it
 *  names none (the polyline budget, an unknown shape). */
export type SaveErrors = {
  byElement: Map<string, ElementError[]>;
  document: string[];
};

export const NO_SAVE_ERRORS: SaveErrors = {
  byElement: new Map(),
  document: [],
};

const LISTS = ["symbols", "pipes", "labels"] as const;
type ListName = (typeof LISTS)[number];
const isList = (v: unknown): v is ListName => LISTS.includes(v as ListName);

/** `["body", "symbols", 3, "bindings", "state"]` lands on the fourth
 *  symbol's `bindings.state`; a request-validation `body` prefix is
 *  stripped so both envelopes read the same. */
export function mapSaveErrors(
  errors: ValidationErrorItem[],
  doc: PlateDocument,
): SaveErrors {
  const out: SaveErrors = { byElement: new Map(), document: [] };
  for (const { loc, msg } of errors) {
    const path = loc[0] === "body" ? loc.slice(1) : loc;
    const [list, index, ...rest] = path;
    const element =
      isList(list) && typeof index === "number"
        ? doc[list]?.[index]
        : undefined;
    if (!element) {
      out.document.push(path.length ? `${path.join(".")}: ${msg}` : msg);
      continue;
    }
    out.byElement.set(element.id, [
      ...(out.byElement.get(element.id) ?? []),
      { path: rest, msg },
    ]);
  }
  return out;
}

/** The violations on `id`, with the entry gone once the element is edited
 *  or removed, so a halo never outlives its fix. */
export function forgetElement(errors: SaveErrors, id: string): SaveErrors {
  if (!errors.byElement.has(id)) return errors;
  const byElement = new Map(errors.byElement);
  byElement.delete(id);
  return { ...errors, byElement };
}

/** How a violation reads under the field it names: the path left after
 *  `under`, then the message. */
export const describeError = (error: ElementError, under = 0): string => {
  const rest = error.path.slice(under);
  return rest.length ? `${rest.join(".")}: ${error.msg}` : error.msg;
};
