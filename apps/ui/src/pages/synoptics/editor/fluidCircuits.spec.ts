import { describe, expect, it } from "vitest";
import { FLUIDS } from "@/lib/fluidColors";
import { FLUID_CIRCUITS } from "./fluidCircuits";

describe("FLUID_CIRCUITS", () => {
  it("names every fluid of the vocabulary exactly once", () => {
    const listed = FLUID_CIRCUITS.flatMap((c) => c.fluids.map((f) => f.fluid));
    // FLUIDS is held to the backend's vocabulary by fluidColors.spec.
    expect([...listed].sort()).toEqual([...FLUIDS].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("pairs a supply with its return, supply first", () => {
    for (const { fluids } of FLUID_CIRCUITS) {
      const roles = fluids.map((f) => f.role);
      if (roles.some(Boolean)) expect(roles).toEqual(["supply", "return"]);
    }
  });
});
