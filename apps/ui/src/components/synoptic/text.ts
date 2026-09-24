/** Width semibold text takes, from the average glyph of the app's face. */
export const textWidth = (text: string, size: number) =>
  Math.round(text.length * size * 0.6);

/** A registry name as the screen reads it: `heat_pump` is "heat pump". */
export const humanize = (name: string) => name.replace(/_/g, " ");

/** A halo in the plate's colour behind text drawn straight on the plate
 *  (names, captions, notes), so a run or a leader passing under it never
 *  crosses the letters. Chips carry their own card. Spread on the `<text>`
 *  with `HALO_CLASS` among its classes. */
export const HALO = {
  paintOrder: "stroke",
  strokeWidth: 3,
  strokeLinejoin: "round",
} as const;
export const HALO_CLASS = "stroke-synoptic-plate";
