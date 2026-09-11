import { z } from "zod";
import type { AttributeCoverage, Device } from "@gridone/sdk";
import { deviceAttributes, type AttributeValue } from "@/lib/devices";
import {
  resolveConstraints,
  type WriteConstraints,
} from "@/components/device-ui/runtime/controls";

export const GROUPED_COMMAND_CONFIRMATION_THRESHOLD = 10;
export const commandValueSchema = z.object({
  value: z
    .union([z.string().min(1), z.number().finite(), z.boolean()])
    .optional()
    .refine((value) => value !== undefined),
});
export const templateNameSchema = z.object({ name: z.string().trim().min(1) });

/** JSON preserves false, zero and numeric-looking strings in shared URLs. */
export function parseCommandValue(
  raw: string | null,
): AttributeValue | undefined {
  if (raw === null) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    const result = commandValueSchema.safeParse({ value });
    return result.success ? result.data.value : undefined;
  } catch {
    return raw || undefined;
  }
}

export function valueMatchesType(
  value: AttributeValue | undefined,
  dataType: string | undefined,
): boolean {
  if (value === undefined || value === "") return false;
  if (dataType === "bool") return typeof value === "boolean";
  if (dataType === "str") return typeof value === "string";
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (dataType === "float" || (dataType === "int" && Number.isInteger(value)))
  );
}

export function reportedValue(
  device: Device,
  attribute: string,
): AttributeValue | undefined {
  const value = deviceAttributes(device)[attribute]?.current_value;
  return typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
    ? value
    : undefined;
}

export function currentValues(
  devices: Device[],
  attribute: string,
): AttributeValue[] {
  return [
    ...new Set(
      devices.flatMap((device) => {
        const value = reportedValue(device, attribute);
        return value == null ? [] : [value];
      }),
    ),
  ];
}

export function currentRange(devices: Device[], attribute: string): string {
  const values = currentValues(devices, attribute);
  if (values.length > 1 && values.every((value) => typeof value === "number")) {
    return `${Math.min(...values)}–${Math.max(...values)}`;
  }
  return values.map(String).join(", ");
}

/** Native input hints use only shared literal bounds; references stay best-effort. */
export function inputBounds(coverage: AttributeCoverage | undefined) {
  const constraints = coverage?.write_constraints;
  return {
    min:
      typeof constraints?.minimum === "number"
        ? constraints.minimum
        : undefined,
    max:
      typeof constraints?.maximum === "number"
        ? constraints.maximum
        : undefined,
    step: typeof constraints?.step === "number" ? constraints.step : undefined,
  };
}

export type ConstraintWarning = "minimum" | "maximum" | "step" | "options";

/** Preview known bounds using the latest sibling readings, matching the server's
 * zero-anchored step grid. These warnings never prevent best-effort dispatch. */
export function constraintWarnings(
  device: Device,
  attribute: string,
  value: AttributeValue | undefined,
) {
  const attr = deviceAttributes(device)[attribute];
  const constraints = resolveConstraints(
    attr?.write_constraints as WriteConstraints | undefined,
    (name) => reportedValue(device, name),
  );
  const warnings: { kind: ConstraintWarning; bound: AttributeValue }[] = [];
  const options = attr?.value_options;
  if (
    value !== undefined &&
    Array.isArray(options) &&
    options.length &&
    !options.includes(value)
  ) {
    warnings.push({ kind: "options", bound: options.join(", ") });
  }
  if (typeof value === "number") {
    if (constraints.minimum !== null && value < constraints.minimum)
      warnings.push({ kind: "minimum", bound: constraints.minimum });
    if (constraints.maximum !== null && value > constraints.maximum)
      warnings.push({ kind: "maximum", bound: constraints.maximum });
    if (
      constraints.step !== null &&
      Math.abs(
        value / constraints.step - Math.round(value / constraints.step),
      ) > 1e-9
    )
      warnings.push({ kind: "step", bound: constraints.step });
  }
  const dynamic = Object.values(attr?.write_constraints ?? {}).some(
    (bound) => bound !== null && typeof bound === "object",
  );
  return { warnings, dynamic };
}
