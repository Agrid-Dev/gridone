import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Scalar } from "../conditions";
import type { SetpointRow } from "../document";
import { localize } from "../face";
import type { AttributeLike, DeviceUiRuntime } from "../runtime";
import { NumberStepper, WriteStateIndicator } from "./ControlPanel";
import { NumberSlider } from "./NumberSlider";
import { formatDeviation, formatMeasurement } from "./formatters";

/**
 * Demanded / regulated / measured / deviation rows. The deviation is the
 * dialect's only arithmetic: a difference of two reported numbers, shown
 * with its sign and classified against the row's tolerance.
 */

export type SetpointTableProps = {
  unavailableLabel?: (binding: string) => string | undefined;
  rows: SetpointRow[];
  runtime: DeviceUiRuntime;
  reported: (binding: string) => Scalar | null;
  attributeOf: (binding: string) => AttributeLike | null;
  language: string;
};

export function SetpointTable({
  rows,
  unavailableLabel,
  runtime,
  reported,
  attributeOf,
  language,
}: SetpointTableProps) {
  const { t } = useTranslation("devices");
  const hasRegulated = rows.some((row) => row.regulated != null);
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-medium">
              <span className="sr-only">{t("presentation.parameter")}</span>
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("presentation.demanded")}
            </th>
            {hasRegulated && (
              <th className="py-2 pr-4 font-medium">
                {t("presentation.regulated")}
              </th>
            )}
            <th className="py-2 pr-4 font-medium">
              {t("presentation.measured")}
            </th>
            <th className="py-2 font-medium">{t("presentation.deviation")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <SetpointTableRow
              key={index}
              unavailableLabel={unavailableLabel}
              row={row}
              hasRegulated={hasRegulated}
              runtime={runtime}
              reported={reported}
              attributeOf={attributeOf}
              language={language}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetpointTableRow({
  unavailableLabel,
  row,
  hasRegulated,
  runtime,
  reported,
  attributeOf,
  language,
}: { row: SetpointRow; hasRegulated: boolean } & Omit<
  SetpointTableProps,
  "rows"
>) {
  const { t } = useTranslation("devices");
  const unavailable = t("presentation.unavailable");
  const label = localize(row.label, language);
  const unitOf = (binding: string | undefined) =>
    binding ? (attributeOf(binding)?.unit ?? null) : null;
  const cell = (binding: string | undefined) => {
    if (!binding) return null;
    return (
      unavailableLabel?.(binding) ??
      formatMeasurement(
        reported(binding),
        row.formatter,
        unitOf(binding),
        language,
      )
    );
  };

  let deviation: { text: string; withinTolerance: boolean } | null = null;
  if (row.deviation) {
    const minuend = reported(row.deviation.minuend);
    const subtrahend = reported(row.deviation.subtrahend);
    if (typeof minuend === "number" && typeof subtrahend === "number") {
      const delta = minuend - subtrahend;
      deviation = {
        text: formatDeviation(
          delta,
          row.formatter?.decimals,
          unitOf(row.deviation.minuend),
          language,
        ),
        withinTolerance: Math.abs(delta) <= row.deviation.tolerance,
      };
    }
  }

  return (
    <tr data-setpoint-row={label}>
      <th
        scope="row"
        className="py-2 pr-4 text-left font-medium text-foreground"
      >
        {label}
      </th>
      <td className="py-2 pr-4">
        {"control" in row.demanded ? (
          <DemandedControl
            id={row.demanded.control}
            runtime={runtime}
            label={label}
          />
        ) : (
          <Value text={cell(row.demanded.binding)} unavailable={unavailable} />
        )}
      </td>
      {hasRegulated && (
        <td className="py-2 pr-4">
          <Value
            text={cell(row.regulated?.binding)}
            unavailable={unavailable}
          />
        </td>
      )}
      <td className="py-2 pr-4">
        <Value text={cell(row.measured?.binding)} unavailable={unavailable} />
      </td>
      <td className="py-2">
        {row.deviation &&
          (deviation ? (
            <span
              data-deviation={deviation.withinTolerance ? "ok" : "out"}
              className={cn(
                "font-medium tabular-nums",
                deviation.withinTolerance
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-amber-700 dark:text-amber-400",
              )}
            >
              {deviation.text}
              <span className="sr-only">
                {" "}
                {deviation.withinTolerance
                  ? t("presentation.withinTolerance")
                  : t("presentation.outOfTolerance")}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">{unavailable}</span>
          ))}
      </td>
    </tr>
  );
}

function DemandedControl({
  id,
  runtime,
  label,
}: {
  id: string;
  runtime: DeviceUiRuntime;
  label: string;
}) {
  const state = runtime.readControl(id);
  if (!state) return null;
  return (
    <div className="space-y-1">
      {state.spec.kind === "number" ? (
        <NumberStepper id={id} state={state} runtime={runtime} label={label} />
      ) : state.spec.kind === "slider" ? (
        <NumberSlider id={id} state={state} runtime={runtime} label={label} />
      ) : (
        <span className="font-medium text-foreground">
          {state.displayed === null ? "—" : String(state.displayed)}
        </span>
      )}
      <WriteStateIndicator state={state.write} />
    </div>
  );
}

function Value({
  text,
  unavailable,
}: {
  text: string | null;
  unavailable: string;
}) {
  if (text === null)
    return <span className="text-muted-foreground">{unavailable}</span>;
  return (
    <span className="font-medium tabular-nums text-foreground">{text}</span>
  );
}
