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

/** `s` with its first letter upper-cased in `locale`: a word written for the
 *  middle of a sentence ("critique", "lundi 12 octobre") heading a line. */
export const capitalize = (s: string, locale?: string): string =>
  s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
