/** Resolves a sibling property of `path`, so a prefixed form
 *  (`config.zone_overrides`) still finds `config.piloted_zones` rather than a
 *  top-level field that isn't there. Shared by `ZoneOverridesField` and
 *  `WeeklyScheduleField`, both of which read a sibling app-config field. */
export const siblingPath = (path: string, sibling: string): string => {
  const lastDot = path.lastIndexOf(".");
  return lastDot === -1 ? sibling : `${path.slice(0, lastDot)}.${sibling}`;
};
