import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { symbolSchemas, type Fluid } from "@gridone/sdk";
import { DRAWINGS } from "@/components/synoptic/symbols/drawings";
import { Chip, CHIP_H, chipWidth } from "@/components/synoptic/Chip";
import { Pipe } from "@/components/synoptic/Pipe";
import { Led } from "@/components/synoptic/symbols/Label";
import { FaultMark } from "@/components/synoptic/symbols/SynopticSymbol";
import { SymbolThumb } from "@/components/synoptic/symbols/SymbolThumb";
import {
  READING_STATES,
  type ReadingState,
  type SlotReading,
} from "@/components/synoptic/values";
import { FLUID_FILL_CLASS, FLUIDS } from "@/lib/fluidColors";
import { SEVERITIES } from "@/lib/severity";
import type { PageVocabulary } from "./usePlateVocabulary";

/** The fluid names, keyed as the locale files spell them. */
const FLUID_KEY: Record<Fluid, `fluids.${Fluid}`> = Object.fromEntries(
  FLUIDS.map((fluid) => [fluid, `fluids.${fluid}` as const]),
) as Record<Fluid, `fluids.${Fluid}`>;

/** The severities as the legend lists them: the one to act on first. */
const WORST_FIRST = [...SEVERITIES].reverse();

/** A reading in each state, drawn by the plate's own chip so the legend
 *  can never show a chip the plate does not draw. */
const sample = (state: ReadingState, value: string): SlotReading => ({
  text: state === "silent" ? null : value,
  unit: state === "note" || state === "silent" ? null : "°C",
  raw: state === "note" ? value : 52.4,
  stale: state === "stale",
  faulty: false,
  literal: state === "note",
});

const ChipSample: FC<{ reading: SlotReading }> = ({ reading }) => {
  const w = chipWidth(reading.text ?? "–", reading.unit, reading.literal) + 4;
  return (
    <svg width={w} height={CHIP_H + 2} aria-hidden className="shrink-0">
      <Chip at={{ x: w / 2, y: CHIP_H / 2 + 1 }} reading={reading} />
    </svg>
  );
};

type PlateLegendProps = {
  fluids: ReadonlySet<Fluid>;
  /** The symbol types the plate draws, for the key; none hides it. */
  types?: ReadonlySet<string>;
  vocabulary?: PageVocabulary;
  /** The plate moves its circuits (the isometric view on screen), which
   *  the legend then explains; paper and the sheet stand still. */
  circulating?: boolean;
};

/**
 * The legend of a plate. First row: one swatch per fluid the plate
 * carries, in the vocabulary's order, a moving run when the plate moves,
 * then every state the plate draws,
 * each drawn by the component that draws it there: a reading live, stale,
 * silent or authored; a fault at each severity; the run-state LED of the
 * sheet, and the state nobody knows; a link to a view that does not
 * exist. Second row, the key: the plan glyph and the name of every symbol
 * type on the plate, so the drawing reads to someone of the trade in
 * either view.
 */
export const PlateLegend: FC<PlateLegendProps> = ({
  fluids,
  types,
  vocabulary,
  circulating = false,
}) => {
  const { t, i18n } = useTranslation("synoptics");
  const { t: tCommon } = useTranslation("common");
  // The sample reading, written the way the locale writes a number.
  const value = new Intl.NumberFormat(i18n.language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(52.4);
  const keyed = [...(types ?? [])]
    .filter((type) => DRAWINGS[type] && symbolSchemas[type])
    .map((type) => ({ type, name: vocabulary?.typeLabel(type) ?? type }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const row =
    "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground";
  const item = "flex items-center gap-1.5";
  return (
    <div className="flex flex-col gap-1">
      <dl aria-label={t("legend.title")} className={row}>
        <dt className="font-semibold uppercase tracking-wide">
          {t("legend.title")}
        </dt>
        {FLUIDS.filter((fluid) => fluids.has(fluid)).map((fluid) => (
          <dd key={fluid} data-legend={`fluid-${fluid}`} className={item}>
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
        {circulating && (
          <dd data-legend="circulating" className={item}>
            <svg width="28" height="10" aria-hidden className="shrink-0">
              <Pipe
                points={[
                  { x: 2, y: 5 },
                  { x: 26, y: 5 },
                ]}
                fluid={FLUIDS.find((fluid) => fluids.has(fluid)) ?? FLUIDS[0]}
                flowing
              />
            </svg>
            {t("legend.circulating")}
          </dd>
        )}
        {READING_STATES.map((state, i) => (
          <dd
            key={state}
            data-legend={`reading-${state}`}
            className={`${item} ${i === 0 ? "border-l border-border pl-4" : ""}`}
          >
            <ChipSample
              reading={sample(state, state === "note" ? "7 × 500 L" : value)}
            />
            {t(`legend.${state}`)}
          </dd>
        ))}
        {WORST_FIRST.map((severity, i) => (
          <dd
            key={severity}
            data-legend={`fault-${severity}`}
            className={`${item} ${i === 0 ? "border-l border-border pl-4" : ""}`}
          >
            <svg width="16" height="16" aria-hidden className="shrink-0">
              <FaultMark level={severity} badge={{ x: 8, y: 8 }} />
            </svg>
            {t("legend.fault")} · {tCommon(`common.severity.${severity}`)}
          </dd>
        ))}
        {(["on", "off"] as const).map((led, i) => (
          <dd
            key={led}
            data-legend={`led-${led}`}
            className={`${item} ${i === 0 ? "border-l border-border pl-4" : ""}`}
          >
            <svg width="10" height="10" aria-hidden className="shrink-0">
              <Led at={{ x: 5, y: 5 }} led={led} fault={null} />
            </svg>
            {t(`legend.led.${led}`)}
          </dd>
        ))}
        <dd data-legend="led-unknown" className={item}>
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-muted-foreground"
          />
          {t("legend.led.unknown")}
        </dd>
        <dd
          data-legend="missing-link"
          className={`${item} border-l border-border pl-4`}
        >
          <svg
            width="20"
            height="12"
            aria-hidden
            className="shrink-0 opacity-40"
          >
            <polygon
              points="1,1 15,1 19,6 15,11 1,11"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              className="fill-none stroke-synoptic-stroke"
            />
          </svg>
          {t("legend.missingLink")}
        </dd>
      </dl>
      {keyed.length > 0 && (
        <dl aria-label={t("legend.symbols")} className={row}>
          <dt className="font-semibold uppercase tracking-wide">
            {t("legend.symbols")}
          </dt>
          {keyed.map(({ type, name }) => (
            <dd key={type} data-legend-symbol={type} className={item}>
              <SymbolThumb type={type} />
              {name}
            </dd>
          ))}
        </dl>
      )}
    </div>
  );
};
