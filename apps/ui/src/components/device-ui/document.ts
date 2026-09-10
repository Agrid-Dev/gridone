import type { DeviceFaceDocument, LocalizedText } from "./face";
import type { PresentationResponse } from "@gridone/sdk";

/**
 * The v1 presentation document a driver may carry (ADR annex B §2). These
 * types mirror the backend's pydantic models; once the API exposes the
 * document, the SDK's generated types replace them.
 */

export type ControlKind = "toggle" | "number" | "select";

export type ControlDocument = {
  kind: ControlKind;
  /** Binding id (not an attribute name). */
  binding: string;
  label: LocalizedText;
};

export type GlyphSetDocument = {
  asset: string;
  line_height: number;
  base_line: number;
  cells: Record<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      advance: number;
      offset_x: number;
      offset_y: number;
    }
  >;
  kerning?: Record<string, number>;
};

/** Declarative formatting of a measured value. */
export type Formatter = {
  decimals?: number;
  /** Unit symbol; when absent, the attribute's own `unit` metadata is used. */
  unit?: string;
  /** Show the elapsed time since the value (an ISO timestamp or epoch). */
  relative_time?: boolean;
  unavailable?: LocalizedText;
};

export type MeasurementItem = {
  binding: string;
  label?: LocalizedText;
  formatter?: Formatter;
};

export type SetpointRow = {
  label: LocalizedText;
  demanded: { control: string } | { binding: string };
  regulated?: { binding: string };
  measured?: { binding: string };
  /** The only arithmetic of the dialect: `minuend − subtrahend`, classified against a tolerance. */
  deviation?: { minuend: string; subtrahend: string; tolerance: number };
  formatter?: Formatter;
};

export type PageNode =
  | { kind: "stack"; children: PageNode[] }
  | { kind: "columns"; items: { weight: number; content: PageNode }[] }
  | {
      kind: "section";
      title: LocalizedText;
      description?: LocalizedText;
      children: PageNode[];
    }
  | { kind: "attributes"; group?: string }
  | { kind: "control-panel"; controls: string[] }
  | { kind: "measurements"; items: MeasurementItem[] }
  | { kind: "setpoint-table"; rows: SetpointRow[] }
  | DeviceFaceDocument;

export type PresentationV1 = {
  schema_version: 1;
  requires: string[];
  assets: Record<string, { path: string }>;
  glyph_sets?: Record<string, GlyphSetDocument>;
  bindings: Record<string, { attribute: string }>;
  controls: Record<string, ControlDocument>;
  page: PageNode;
};

export type PresentationDiagnostic = {
  code:
    | Extract<
        PresentationResponse,
        { status: "unavailable" }
      >["diagnostics"][number]["code"]
    | "unsupported_version"
    | "unsupported_capability"
    | "invalid_document"
    | "missing_binding"
    | "asset_unavailable"
    | "render_error";
  path?: string;
  message?: string;
};
