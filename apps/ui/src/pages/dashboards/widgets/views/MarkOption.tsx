import type { FC } from "react";
import { useTranslation } from "react-i18next";

/** One entry in the mark list: how the series is drawn, and what that shape
 *  says about the numbers — a line joins instants, a bar covers the bucket it
 *  reports, which is the distinction worth making when picking between them. */
export const MarkOption: FC<{ name: string }> = ({ name }) => {
  const { t } = useTranslation("dashboards");
  return (
    <span className="flex w-full items-baseline gap-2">
      <span>
        {t(
          `widgets.chart.mark.names.${name}` as "widgets.chart.mark.names.line",
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {t(
          `widgets.chart.mark.captions.${name}` as "widgets.chart.mark.captions.line",
        )}
      </span>
    </span>
  );
};
