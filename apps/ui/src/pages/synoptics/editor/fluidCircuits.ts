import type { Fluid } from "@gridone/sdk";

export type Circuit =
  | "primary"
  | "heating"
  | "dhw"
  | "coldWater"
  | "chilled"
  | "condenser";

/** A fluid's place in its circuit: the supply or the return of a pair, or
 *  a fluid named on its own (the domestic hot water and its loop, cold
 *  water). */
export type CircuitFluid = { fluid: Fluid; role?: "supply" | "return" };

/**
 * The fluid vocabulary sorted by circuit, supply beside return, which is
 * how an author thinks of a pipe ("the heating return") and how the picker
 * lays it out. Every member of `Fluid` appears once; the spec holds this
 * list to the colour map, which the backend's vocabulary is checked against.
 */
export const FLUID_CIRCUITS: { circuit: Circuit; fluids: CircuitFluid[] }[] = [
  {
    circuit: "primary",
    fluids: [
      { fluid: "primary_supply", role: "supply" },
      { fluid: "primary_return", role: "return" },
    ],
  },
  {
    circuit: "heating",
    fluids: [
      { fluid: "heating_supply", role: "supply" },
      { fluid: "heating_return", role: "return" },
    ],
  },
  { circuit: "dhw", fluids: [{ fluid: "dhw" }, { fluid: "dhw_loop" }] },
  { circuit: "coldWater", fluids: [{ fluid: "cold_water" }] },
  {
    circuit: "chilled",
    fluids: [
      { fluid: "chilled_supply", role: "supply" },
      { fluid: "chilled_return", role: "return" },
    ],
  },
  {
    circuit: "condenser",
    fluids: [
      { fluid: "condenser_supply", role: "supply" },
      { fluid: "condenser_return", role: "return" },
    ],
  },
];
