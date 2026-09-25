import { useTranslation } from "react-i18next";
import type { Fluid } from "@gridone/sdk";
import { fluidFillClass } from "@/lib/fluidColors";
import { cn } from "@/lib/utils";
import { FLUID_CIRCUITS } from "../fluidCircuits";

/** A fluid's colour, as the plate draws its runs. */
export function FluidSwatch({
  fluid,
  className,
}: {
  fluid: Fluid;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={cn("size-3 shrink-0", className)}
    >
      <circle cx={6} cy={6} r={6} className={fluidFillClass(fluid)} />
    </svg>
  );
}

/**
 * The fluids by circuit, supply beside return: the way an author thinks of
 * a pipe ("the heating return"), each button in the colour the plate draws
 * it in.
 */
export function FluidPicker({
  value,
  onChange,
}: {
  value: Fluid;
  onChange: (fluid: Fluid) => void;
}) {
  const { t } = useTranslation("synoptics");
  return (
    <div
      role="group"
      aria-label={t("editor.fluid")}
      className="grid grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5"
    >
      {FLUID_CIRCUITS.map(({ circuit, fluids }) => (
        <div key={circuit} className="contents">
          <span className="text-xs text-muted-foreground">
            {t(`editor.circuits.${circuit}`)}
          </span>
          {fluids.map(({ fluid, role }) => {
            const on = fluid === value;
            return (
              <button
                key={fluid}
                type="button"
                aria-pressed={on}
                aria-label={t(`fluids.${fluid}`)}
                data-fluid={fluid}
                onClick={() => onChange(fluid)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md border px-2 text-left text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  fluids.length === 1 && "col-span-2",
                  on
                    ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                    : "bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <FluidSwatch fluid={fluid} />
                <span className="truncate">
                  {role ? t(`editor.fluidRoles.${role}`) : t(`fluids.${fluid}`)}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
