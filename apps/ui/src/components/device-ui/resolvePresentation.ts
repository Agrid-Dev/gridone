import type { PresentationDiagnostic, PresentationV1 } from "./document";

/**
 * Capabilities this build of the engine renders. A document that requires
 * anything else is not rendered, whatever the server said: the browser
 * checks its own compatibility (ADR §10). Announce a new capability only
 * with its renderer, tests and documentation.
 */
export const SUPPORTED_CAPABILITIES: ReadonlySet<string> = new Set([
  "layout/1",
  "layout-options/1",
  "controls/1",
  "slider/1",
  "measurements/1",
  "measurement-layout/1",
  "setpoint-table/1",
  "device-face/1",
  "glyph-text/1",
  "conditions/1",
]);

export const SUPPORTED_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1]);

export type Resolution =
  | { status: "available"; document: PresentationV1 }
  | { status: "unavailable"; diagnostics: PresentationDiagnostic[] };

/** An opaque envelope as stored by the driver: only the peeked fields are trusted. */
export type PresentationEnvelope = {
  schema_version: number;
  requires: string[];
  [key: string]: unknown;
};

/**
 * Decide whether the engine can render an envelope. The server validated
 * the document's structure and references; this only answers "do I speak
 * this dialect", so an older browser facing a newer package falls back
 * with a diagnostic instead of rendering a subset.
 */
export function resolvePresentation(
  envelope: PresentationEnvelope | null | undefined,
): Resolution | null {
  if (envelope === null || envelope === undefined) return null;
  const diagnostics: PresentationDiagnostic[] = [];
  if (!SUPPORTED_SCHEMA_VERSIONS.has(envelope.schema_version)) {
    diagnostics.push({
      code: "unsupported_version",
      path: "/schema_version",
      message: String(envelope.schema_version),
    });
  }
  for (const [index, capability] of envelope.requires.entries()) {
    if (!SUPPORTED_CAPABILITIES.has(capability)) {
      diagnostics.push({
        code: "unsupported_capability",
        path: `/requires/${index}`,
        message: capability,
      });
    }
  }
  if (diagnostics.length > 0) return { status: "unavailable", diagnostics };
  return {
    status: "available",
    document: envelope as unknown as PresentationV1,
  };
}
