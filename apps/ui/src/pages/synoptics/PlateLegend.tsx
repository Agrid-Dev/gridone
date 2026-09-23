import type { FC } from "react";
import { useTranslation } from "react-i18next";
import type { Fluid } from "@gridone/sdk";
import { FLUID_FILL_CLASS, FLUIDS } from "@/lib/fluidColors";

/** The fluid names, keyed as the locale files spell them. */
const FLUID_KEY: Record<Fluid, `fluids.${Fluid}`> = Object.fromEntries(
  FLUIDS.map((fluid) => [fluid, `fluids.${fluid}` as const]),
) as Record<Fluid, `fluids.${Fluid}`>;

/**
 * The legend under a plate: one swatch per fluid the plate carries, in the
 * vocabulary's order, then how a live reading, a fault and a point no
 * device instruments look.
 */
export const PlateLegend: FC<{ fluids: ReadonlySet<Fluid> }> = ({ fluids }) => {
  const { t, i18n } = useTranslation("synoptics");
  // The sample reading, written the way the locale writes a number.
  const sample = `${new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(52.4)} °C`;
  return (
    <dl
      aria-label={t("legend.title")}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
    >
      <dt className="font-semibold uppercase tracking-wide">
        {t("legend.title")}
      </dt>
      {FLUIDS.filter((fluid) => fluids.has(fluid)).map((fluid) => (
        <dd key={fluid} className="flex items-center gap-1.5">
          <svg width="20" height="6" aria-hidden className="shrink-0">
            <rect
              width="20"
              height="6"
              rx="3"
              className={FLUID_FILL_CLASS[fluid]}
            />
          </svg>
          {t(FLUID_KEY[fluid])}
        </dd>
      ))}
      <dd className="flex items-center gap-1.5 border-l border-border pl-4">
        <span className="font-semibold tabular-nums text-synoptic-reading">
          {sample}
        </span>
        {t("legend.live")}
      </dd>
      <dd className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full bg-status-error" />
        {t("legend.fault")}
      </dd>
      <dd className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground"
        />
        {t("legend.unmeasured")}
      </dd>
    </dl>
  );
};
