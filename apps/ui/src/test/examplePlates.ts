import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The fictional example plates of the synoptic spec, for the specs that need
 *  a whole plate. A site's plates live on its instance, never here. */
export const PLATES_DIR = resolve(
  import.meta.dirname,
  "../../../../docs/specs/synoptic",
);
export const EXAMPLE_PLATES = ["example-dhw", "example-heating"] as const;
export type ExamplePlate = (typeof EXAMPLE_PLATES)[number];

export const readPlate = (name: ExamplePlate): unknown =>
  JSON.parse(readFileSync(resolve(PLATES_DIR, `${name}.json`), "utf8"));
