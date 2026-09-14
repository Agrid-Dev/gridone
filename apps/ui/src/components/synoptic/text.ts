/** Width semibold text takes, from the average glyph of the app's face. */
export const textWidth = (text: string, size: number) =>
  Math.round(text.length * size * 0.6);
