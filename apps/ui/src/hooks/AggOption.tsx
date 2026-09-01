import type { FC } from "react";
import { useTranslation } from "react-i18next";
import type { DataType } from "@gridone/sdk";

/**
 * One entry in the aggregation list: the operator's own name, a short gloss,
 * and the type it would yield for the chosen attribute.
 *
 * The name leads because these are terms of art, kept as they are written
 * everywhere else — spelling `tw_avg` out in full crowds the attribute it
 * qualifies, and each reading would then differ by language. The gloss carries
 * the meaning without displacing the term.
 *
 * The result type is worth showing because aggregating can change it: `count`
 * yields an int whatever went in, and averaging a bool yields a float, which is
 * what decides whether the widget draws a line or an on/off band.
 */
export const AggOption: FC<{
  name: string;
  resultType?: DataType | null;
  /** Which caption set glosses the name — time operators by default. */
  kind?: "agg" | "space";
}> = ({ name, resultType, kind = "agg" }) => {
  const { t } = useTranslation("dashboards");
  return (
    <span className="flex w-full items-baseline gap-2">
      <span>{name}</span>
      <span className="text-xs text-muted-foreground">
        {t(
          `widgets.chart.${kind}.captions.${name}` as "widgets.chart.agg.captions.avg",
        )}
      </span>
      {resultType !== undefined && (
        <span className="ml-auto pl-3 text-xs text-muted-foreground">
          {resultType ?? t("widgets.chart.agg.unsupported")}
        </span>
      )}
    </span>
  );
};
