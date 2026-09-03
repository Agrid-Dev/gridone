import type { FC } from "react";
import { useTranslation } from "react-i18next";

/**
 * One entry in the bucket-width list: the width as the API writes it, glossed
 * in words.
 *
 * The wire form leads, like the aggregation operators next to it — `15min` is
 * what the endpoint, the series label and the saved config all say, so the
 * picker naming it differently would leave nothing to match against. The gloss
 * is a plain-language reading of the same width.
 *
 * A width with no gloss falls back to the wire form alone: the ladder is the
 * backend's to publish (`GET /timeseries/aggregate/options`), so one added
 * there must render as itself rather than as a missing translation key.
 */
export const IntervalOption: FC<{ interval: string }> = ({ interval }) => {
  const { t } = useTranslation("dashboards");
  const caption = t(
    `widgets.chart.interval.captions.${interval}` as "widgets.chart.interval.captions.auto",
    { defaultValue: "" },
  );
  return (
    <span className="flex w-full items-baseline gap-2">
      <span>{interval}</span>
      {caption && (
        <span className="text-xs text-muted-foreground">{caption}</span>
      )}
    </span>
  );
};
