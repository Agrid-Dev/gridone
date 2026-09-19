/** Width semibold text takes, from the average glyph of the app's face. */
export const textWidth = (text: string, size: number) =>
  Math.round(text.length * size * 0.6);

/** A registry name as the screen reads it: `heat_pump` is "heat pump". */
export const humanize = (name: string) => name.replace(/_/g, " ");
