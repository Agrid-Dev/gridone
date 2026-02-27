/**
 * Translation sync checker.
 *
 * Validates that all locale JSON files stay in sync with the reference locale (en).
 * Checks performed:
 *   1. Missing keys — keys present in reference but absent in a locale
 *   2. Extra keys   — keys present in a locale but absent in reference
 *   3. Key ordering  — keys must appear in the same order across all files
 *   4. Interpolation — {{variable}} placeholders must match between translations
 *
 * Usage:  tsx scripts/check-translations.ts
 * Exit 0 on success, 1 on any mismatch.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, "..", "src", "locales");
const REFERENCE_LOCALE = "en";

// ── Types ────────────────────────────────────────────────────

type NestedJSON = { [key: string]: string | NestedJSON };

type ErrorType = "missing" | "extra" | "order" | "interpolation";

interface TranslationError {
  locale: string;
  key: string;
  type: ErrorType;
  detail?: string;
}

// ── Helpers ──────────────────────────────────────────────────

/** Flatten a nested object into an ordered list of dot-separated keys. */
function flattenKeys(obj: NestedJSON, prefix = ""): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (typeof value === "object" && value !== null) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/** Extract all {{variable}} placeholders from a string. */
function extractInterpolations(value: unknown): string[] {
  const matches = typeof value === "string" ? value.match(/\{\{(\w+)\}\}/g) : null;
  return matches ? matches.sort() : [];
}

/** Resolve a dot-path to a value in a nested object. */
function getNestedValue(obj: NestedJSON, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") return (acc as NestedJSON)[key];
    return undefined;
  }, obj);
}

// ── Main ─────────────────────────────────────────────────────

function checkTranslations(): void {
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));
  const referenceFile = files.find((f) => f.replace(".json", "") === REFERENCE_LOCALE);

  if (!referenceFile) {
    console.error(`Reference locale "${REFERENCE_LOCALE}.json" not found in ${LOCALES_DIR}`);
    process.exit(1);
  }

  const refPath = join(LOCALES_DIR, referenceFile);
  const refData: NestedJSON = JSON.parse(readFileSync(refPath, "utf-8"));
  const refKeys = flattenKeys(refData);
  const refKeySet = new Set(refKeys);

  const secondaryFiles = files.filter((f) => f !== referenceFile);
  const errors: TranslationError[] = [];

  for (const file of secondaryFiles) {
    const locale = file.replace(".json", "");
    const filePath = join(LOCALES_DIR, file);
    const data: NestedJSON = JSON.parse(readFileSync(filePath, "utf-8"));
    const keys = flattenKeys(data);
    const keySet = new Set(keys);

    // 1. Missing keys
    for (const key of refKeys) {
      if (!keySet.has(key)) {
        errors.push({ locale, key, type: "missing" });
      }
    }

    // 2. Extra keys
    for (const key of keys) {
      if (!refKeySet.has(key)) {
        errors.push({ locale, key, type: "extra" });
      }
    }

    // 3. Key order — compare only the intersection
    const commonRef = refKeys.filter((k) => keySet.has(k));
    const commonLocale = keys.filter((k) => refKeySet.has(k));
    for (let i = 0; i < commonRef.length; i++) {
      if (commonRef[i] !== commonLocale[i]) {
        errors.push({
          locale,
          key: commonLocale[i],
          type: "order",
          detail: `expected "${commonRef[i]}" at position ${i}, got "${commonLocale[i]}"`,
        });
        break; // one order error is enough to flag the file
      }
    }

    // 4. Interpolation consistency
    //    Plural _one forms are allowed to omit {{count}} (e.g. French "Dernière heure").
    for (const key of refKeys) {
      if (!keySet.has(key)) continue;
      const refVars = extractInterpolations(getNestedValue(refData, key));
      const localeVars = extractInterpolations(getNestedValue(data, key));
      if (refVars.join(",") !== localeVars.join(",")) {
        const isPluralOne = key.endsWith("_one");
        const diff = refVars.filter((v) => !localeVars.includes(v));
        if (isPluralOne && diff.length === 1 && diff[0] === "{{count}}") continue;
        errors.push({
          locale,
          key,
          type: "interpolation",
          detail: `expected ${JSON.stringify(refVars)}, got ${JSON.stringify(localeVars)}`,
        });
      }
    }
  }

  // ── Report ───────────────────────────────────────────────
  if (errors.length > 0) {
    console.error(`\nTranslation check failed — ${errors.length} issue(s):\n`);
    for (const e of errors) {
      const detail = e.detail ? ` (${e.detail})` : "";
      console.error(`  [${e.locale}] ${e.type}: ${e.key}${detail}`);
    }
    console.error("");
    process.exit(1);
  }

  console.log("Translations in sync.");
}

checkTranslations();
