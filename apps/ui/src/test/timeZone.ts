import process from "node:process";
import { afterEach, beforeEach } from "vitest";

/**
 * Runs each test of the enclosing suite in `zone`, as if the browser sat
 * there: Node reads `TZ` on every date operation, so the change holds at
 * once. The zone in force before comes back after each test, unset if it was
 * unset — assigning `undefined` would leave the string "undefined" behind.
 */
export function inTimeZone(zone: string) {
  const previous = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = zone;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}
