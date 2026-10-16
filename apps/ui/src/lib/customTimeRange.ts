import { z } from "zod";

/** Format browser-local wall time, preserving seconds in shared ISO links. */
export function localDateTime(timestamp: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  const minute = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getMilliseconds())
    return `${minute}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  return date.getSeconds() ? `${minute}:${pad(date.getSeconds())}` : minute;
}

/** Compare native inputs with omitted seconds or shortened milliseconds. */
function canonicalWallTime(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole.length === 16 ? `${whole}:00` : whole}.${fraction.padEnd(3, "0")}`;
}

/** Reject nonexistent wall times, including the hour skipped at spring DST. */
function validLocalDateTime(value: string): boolean {
  const roundTrip = localDateTime(value);
  return (
    Boolean(roundTrip) &&
    canonicalWallTime(roundTrip) === canonicalWallTime(value)
  );
}

export const customRangeSchema = z
  .object({ start: z.string(), end: z.string() })
  .superRefine((values, ctx) => {
    if (!values.start && !values.end) {
      ctx.addIssue({ code: "custom", path: ["start"], message: "required" });
    }
    for (const field of ["start", "end"] as const) {
      const value = values[field];
      if (!value) continue;
      if (!validLocalDateTime(value)) {
        ctx.addIssue({ code: "custom", path: [field], message: "invalid" });
      } else if (Date.parse(value) > Date.now()) {
        ctx.addIssue({ code: "custom", path: [field], message: "future" });
      }
    }
    if (
      values.start &&
      values.end &&
      Date.parse(values.start) >= Date.parse(values.end)
    ) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "reversed" });
    }
  });

/** Keep the original instant when reopening an ambiguous autumn DST hour. */
export function localToUtc(value: string, original = ""): string {
  if (!value) return "";
  return new Date(
    original &&
      canonicalWallTime(value) === canonicalWallTime(localDateTime(original))
      ? original
      : value,
  ).toISOString();
}
