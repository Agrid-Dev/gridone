export type CycleMedium = "water" | "air";

export type CycleMedia = { evaporator: CycleMedium; condenser: CycleMedium };

/**
 * Which medium (water or air) each refrigerant-cycle exchanger works
 * against. The evaporator is always the cold exchanger and the condenser the
 * hot one; a reversible unit swaps the media instead: cooling chills the
 * water at the evaporator and rejects heat to air, heating extracts from air
 * and heats the water at the condenser. Any mode other than "heat" (cool,
 * auto, unknown, none) reads as cooling — the chiller-first layout.
 */
export function cycleMedia(mode: string | null): CycleMedia {
  return mode === "heat"
    ? { evaporator: "air", condenser: "water" }
    : { evaporator: "water", condenser: "air" };
}
