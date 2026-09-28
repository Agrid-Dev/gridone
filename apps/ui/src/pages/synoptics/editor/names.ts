import type { Fluid, PipeElement, SymbolElement } from "@gridone/sdk";

/** The first letter up: the catalogue writes type names in lower case,
 *  for use inside a sentence. */
export const capitalize = (s: string) =>
  s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s;

/** The number an id the editor made ends with (`pump-2` for a pump is 2),
 *  or null for an id written by hand (`pac-03`), which reads as itself. */
function generatedNumber(id: string, prefix: string): string | null {
  const match = /^(.+)-(\d+)$/.exec(id);
  return match && match[1] === prefix ? match[2] : null;
}

/**
 * What the editor calls a symbol: its label when it has one, else its type
 * and the number the editor gave it ("Pompe 2"), else its id. The plate
 * shows the label alone; the editor needs a name for every symbol, so an
 * author can tell two unnamed pumps apart in a list.
 */
export function symbolName(
  symbol: SymbolElement,
  typeLabel: (type: string) => string,
): string {
  const label = symbol.label?.trim();
  if (label) return label;
  const n = generatedNumber(symbol.id, symbol.type);
  return n ? `${capitalize(typeLabel(symbol.type))} ${n}` : symbol.id;
}

/** What the editor calls a run: its fluid and the number the editor gave
 *  it ("Primaire départ 1"), or its id when it was named by hand. */
export function pipeName(
  pipe: PipeElement,
  fluidLabel: (fluid: Fluid) => string,
): string {
  const n = generatedNumber(pipe.id, pipe.fluid);
  return n ? `${capitalize(fluidLabel(pipe.fluid))} ${n}` : pipe.id;
}
