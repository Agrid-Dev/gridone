import { useTranslation } from "react-i18next";
import { toLabel } from "@/lib/textFormat";
import { cn } from "@/lib/utils";
import type { Scalar } from "../conditions";
import type { MeasurementItem, MeasurementLayout } from "../document";
import { localize } from "../face";
import type { AttributeLike } from "../runtime";
import type { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { formatMeasurement } from "./formatters";

/**
 * A list of reported values with declarative formatting, grouped into
 * sub-sections by the attributes' `group` metadata. Reported values only:
 * an intention is never shown as a measurement.
 */

export type MeasurementsProps = {
  unavailableLabel?: (binding: string) => string | undefined;
  items: MeasurementItem[];
  layout?: MeasurementLayout;
  reported: (binding: string) => Scalar | null;
  attributeOf: (binding: string) => AttributeLike | null;
  attributeLabel: ReturnType<typeof useAttributeLabel>;
  language: string;
};

export function Measurements({
  items,
  unavailableLabel,
  layout = "grouped",
  reported,
  attributeOf,
  attributeLabel,
  language,
}: MeasurementsProps) {
  const groups = new Map<string | null, MeasurementItem[]>();
  for (const item of items) {
    const group =
      layout === "grouped" ? (attributeOf(item.binding)?.group ?? null) : null;
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return (
    <div
      data-measurement-layout={layout}
      className={cn("space-y-4", layout === "rows" && "rounded-lg border px-4")}
    >
      {Array.from(groups.entries()).map(([group, groupItems]) => (
        <section key={group ?? ""} className="space-y-1">
          {group && (
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {toLabel(group)}
            </h4>
          )}
          <dl
            className={
              layout === "inline"
                ? "flex flex-wrap justify-center gap-x-5 gap-y-2"
                : "divide-y divide-border"
            }
          >
            {groupItems.map((item) => (
              <MeasurementRow
                key={item.binding}
                unavailableLabel={unavailableLabel?.(item.binding)}
                item={item}
                value={reported(item.binding)}
                attribute={attributeOf(item.binding)}
                attributeLabel={attributeLabel}
                language={language}
                layout={layout}
              />
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function MeasurementRow({
  unavailableLabel,
  item,
  value,
  attribute,
  attributeLabel,
  language,
  layout,
}: {
  unavailableLabel?: string;
  item: MeasurementItem;
  value: Scalar | null;
  attribute: AttributeLike | null;
  attributeLabel: MeasurementsProps["attributeLabel"];
  language: string;
  layout: MeasurementLayout;
}) {
  const { t } = useTranslation("devices");
  const label = item.label
    ? localize(item.label, language)
    : attribute
      ? attributeLabel(attribute.name, attribute)
      : item.binding;
  const text = formatMeasurement(
    value,
    item.formatter,
    attribute?.unit ?? null,
    language,
  );
  const unavailable = item.formatter?.unavailable
    ? localize(item.formatter.unavailable, language)
    : t("presentation.unavailable");
  return (
    <div
      className={cn(
        "flex items-baseline",
        layout === "inline"
          ? "gap-1.5 text-xs"
          : "justify-between gap-4 text-sm",
        layout === "rows" ? "py-3" : "py-1.5",
      )}
      data-binding={item.binding}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          text === null
            ? "text-muted-foreground"
            : "font-medium tabular-nums text-foreground"
        }
      >
        {text ?? unavailableLabel ?? unavailable}
      </dd>
    </div>
  );
}
