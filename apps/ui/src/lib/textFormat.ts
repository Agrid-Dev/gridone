export const toLabel = (s: string): string => {
  return s
    .replace(/[_-\s]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
};
