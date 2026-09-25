import { symbolSchemas } from "@gridone/sdk";
import { foldText } from "@/lib/textFormat";

/** The data type a library row carries while it is dragged onto the plan. */
export const SYMBOL_DRAG_TYPE = "application/x-gridone-symbol";

/** The shelves of the symbol library, in the order the panel shows them. */
export const LIBRARY_GROUPS = [
  "production",
  "storage",
  "distribution",
  "onPipe",
  "navigation",
  "other",
] as const;
export type LibraryGroupId = (typeof LIBRARY_GROUPS)[number];

export type LibraryGroup = { id: LibraryGroupId; types: string[] };

/** Where the free-standing types go. An inline type always goes on the
 *  "on a pipe" shelf, whatever it is, because that is how it is placed;
 *  a type the registry adds later lands on "other" until it is filed. */
const SHELF: Record<string, LibraryGroupId> = {
  heat_pump: "production",
  plate_exchanger: "production",
  tank: "storage",
  expansion_vessel: "storage",
  collector: "distribution",
  mixing_valve: "distribution",
  link: "navigation",
};

/** The order within a shelf: the common before the rare. */
const ORDER = [
  "heat_pump",
  "plate_exchanger",
  "tank",
  "expansion_vessel",
  "collector",
  "mixing_valve",
  "pump",
  "pump_double",
  "valve_isolation",
  "valve_control",
  "valve_check",
  "air_separator",
  "dirt_separator",
  "energy_meter",
  "loop_heater",
  "link",
];

/** Whether a type rides a run instead of standing on the floor. */
export const isInline = (type: string) => !!symbolSchemas[type]?.["x-inline"];

export const shelfOf = (type: string): LibraryGroupId =>
  isInline(type) ? "onPipe" : (SHELF[type] ?? "other");

const rank = (type: string) => {
  const i = ORDER.indexOf(type);
  return i < 0 ? ORDER.length : i;
};

/** The registry's types on their shelves, empty shelves left out. */
export function libraryGroups(
  types: string[] = Object.keys(symbolSchemas),
): LibraryGroup[] {
  const sorted = [...types].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
  return LIBRARY_GROUPS.map((id) => ({
    id,
    types: sorted.filter((type) => shelfOf(type) === id),
  })).filter((group) => group.types.length > 0);
}

/** Whether a type answers the library search, by the name the author reads
 *  or by its registry id, accents and case aside. */
export function matchesQuery(
  type: string,
  label: string,
  query: string,
): boolean {
  const needle = foldText(query.trim());
  if (!needle) return true;
  return (
    foldText(label).includes(needle) ||
    foldText(type.replace(/_/g, " ")).includes(needle)
  );
}
