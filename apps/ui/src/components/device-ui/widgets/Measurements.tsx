import { useTranslation } from "react-i18next";
import { toLabel } from "@/lib/textFormat";
import type { Scalar } from "../conditions";
import type { MeasurementItem } from "../document";
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
  items: MeasurementItem[];
  reported: (binding: string) => Scalar | null;
  attributeOf: (binding: string) => AttributeLike | null;
  attributeLabel: ReturnType<typeof useAttributeLabel>;
  language: string;
};

export function Measurements({
  items,
  reported,
  attributeOf,
  attributeLabel,
  language,
}: MeasurementsProps) {
  const groups = new Map<string | null, MeasurementItem[]>();
  for (const item of items) {
    const group = attributeOf(item.binding)?.group ?? null;
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([group, groupItems]) => (
        <section key={group ?? ""} className="space-y-1">
          {group && (
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {toLabel(group)}
            </h4>
          )}
          <dl className="divide-y divide-border">
            {groupItems.map((item) => (
              <MeasurementRow
                key={item.binding}
                item={item}
                value={reported(item.binding)}
                attribute={attributeOf(item.binding)}
                attributeLabel={attributeLabel}
                language={language}
              />
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function MeasurementRow({
  item,
  value,
  attribute,
  attributeLabel,
  language,
}: {
  item: MeasurementItem;
  value: Scalar | null;
  attribute: AttributeLike | null;
  attributeLabel: MeasurementsProps["attributeLabel"];
  language: string;
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
      className="flex items-baseline justify-between gap-4 py-1.5 text-sm"
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
        {text ?? unavailable}
      </dd>
    </div>
  );
}
