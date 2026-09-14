import schemas from "./generated/symbol-schemas.json";
import type { SymbolSchema } from "./types";

/** The symbol registry's contract per type, generated from the backend with
 *  `npm run generate-symbol-schemas`. */
export const symbolSchemas = schemas as Record<string, SymbolSchema>;
