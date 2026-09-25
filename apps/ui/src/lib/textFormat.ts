export const toLabel = (s: string): string => {
  return s
    .replace(/[_-\s]+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
};

/** A text folded for search: accents and case dropped, so "rechauffeur"
 *  finds "RÉCHAUFFEUR" and "arret" finds "Arrêt". */
export const foldText = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
