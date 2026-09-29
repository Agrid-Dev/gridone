import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Synoptic } from "@gridone/sdk";

/** The plates committed under `docs/specs/synoptic/`, by file stem, read off
 *  the folder so a new plate is held to every probe the moment it lands. Read
 *  from the spec, so the customer-bound documents live in docs/ and on the
 *  instance, never in the bundle. */
export const PLATES_DIR = resolve(
  import.meta.dirname,
  "../../../../docs/specs/synoptic",
);

export const COMMITTED_PLATES = readdirSync(PLATES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();

/** A committed plate as the app holds it, straight off disk. */
export const committedPlate = (name: string): Synoptic => ({
  ...JSON.parse(readFileSync(resolve(PLATES_DIR, `${name}.json`), "utf8")),
  id: name,
  metadata: {},
});

/** The plates whose runs can circulate: a `flow` binding on at least one
 *  run. A plate that binds none (every reading on it a marker) moves
 *  nothing, and has no place in a probe of what moves. */
export const FLOWING_PLATES = COMMITTED_PLATES.filter((name) =>
  (committedPlate(name).pipes ?? []).some((p) => p.flow),
);
