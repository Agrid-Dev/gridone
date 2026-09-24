import type { FC } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Fluid, Projection, Synoptic } from "@gridone/sdk";
import { SynopticRenderer } from "@/components/synoptic/SynopticRenderer";
import type { SynopticValues } from "@/components/synoptic/values";
import { PlateLegend } from "./PlateLegend";
import type { PageVocabulary } from "./usePlateVocabulary";

type PlatePrintSheetProps = {
  /** The plate as the page draws it: in the view on screen, its drawn
   *  title left to the sheet's own. */
  doc: Synoptic;
  name: string;
  description?: string | null;
  projection: Projection;
  values: SynopticValues;
  /** The plates that exist: a link to another reads missing, as on screen. */
  knownSynoptics: ReadonlySet<string>;
  vocabulary: PageVocabulary;
  fluids: ReadonlySet<Fluid>;
  types: ReadonlySet<string>;
};

/**
 * What a plate prints as, for a PDF: one A3 landscape page with the plate's
 * name, its description and the moment it was printed, which the values
 * stand as of (a stale one prints as stale), the whole plate
 * fitted with every label at its drawn size (a PDF zooms, so nothing gives
 * way), and the full legend. The fluid stands still on paper.
 *
 * Mounted only while printing, at the end of the body: the print styles
 * of `index.css` hide everything else and print it on an A3 landscape page
 * of its own; the screen never shows it.
 */
export const PlatePrintSheet: FC<PlatePrintSheetProps> = ({
  doc,
  name,
  description,
  projection,
  values,
  knownSynoptics,
  vocabulary,
  fluids,
  types,
}) => {
  const { t, i18n } = useTranslation("synoptics");
  const readAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  return createPortal(
    <div
      data-print-sheet
      className="hidden h-[277mm] w-[400mm] flex-col gap-3 bg-background text-foreground [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:flex"
    >
      <header className="flex items-end justify-between gap-8 border-b border-border pb-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{name}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {t("print.valuesAt", { date: readAt })} ·{" "}
          {t(projection === "isometric" ? "view.isometric" : "view.plan")}
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <SynopticRenderer
          doc={doc}
          values={values}
          knownSynoptics={knownSynoptics}
          vocabulary={vocabulary}
          animated={false}
        />
      </div>
      <PlateLegend fluids={fluids} types={types} vocabulary={vocabulary} />
    </div>,
    document.body,
  );
};
