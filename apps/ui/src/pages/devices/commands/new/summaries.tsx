import { toLabel } from "@/lib/textFormat";
import { formatValue } from "@/lib/formatValue";
import type { WizardFormValues } from "./types";

/** Inline ``attribute = value`` summary shown when the command step is
 *  collapsed. The target step's done-summary uses ``TargetPresenter``
 *  directly so by-filter targets render with their asset / type chips. */
export function CommandSummary({ values }: { values: WizardFormValues }) {
  if (!values.attribute || values.value === undefined) {
    return <span>—</span>;
  }
  return (
    <span className="text-foreground">
      <span className="font-medium">{toLabel(values.attribute)}</span>
      <span className="mx-2 text-muted-foreground">=</span>
      <span className="font-mono tabular-nums">
        {formatValue(values.value, values.attributeDataType)}
      </span>
    </span>
  );
}
