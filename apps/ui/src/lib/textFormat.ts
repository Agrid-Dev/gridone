export const toLabel = (s: string): string => {
  return s
    .replace(/[_-\s]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
};
