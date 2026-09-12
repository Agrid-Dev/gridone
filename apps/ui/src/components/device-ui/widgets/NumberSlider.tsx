import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { BoundControlState, DeviceUiRuntime } from "../runtime";
import { decimalsOf, sliderRange } from "../runtime/controls";
import { formatNumber } from "./formatters";
import { ControlValue } from "./ControlValue";

/** A native, keyboard-accessible range; drag intentions use the shared debounce. */
export function NumberSlider({
  id,
  state,
  runtime,
  label,
}: {
  id: string;
  state: BoundControlState;
  runtime: DeviceUiRuntime;
  label: string;
}) {
  const inputId = useId();
  const { t, i18n } = useTranslation("devices");
  const range = sliderRange(state.constraints);
  const displayed =
    typeof state.displayed === "number" && Number.isFinite(state.displayed)
      ? state.displayed
      : null;
  const value =
    displayed !== null
      ? formatNumber(
          displayed,
          range ? decimalsOf(range.step) : undefined,
          i18n.language,
        )
      : (state.valueLabel ?? t("presentation.unavailable"));
  const text =
    displayed !== null && state.attribute?.unit
      ? `${value} ${state.attribute.unit}`
      : value;
  return (
    <div className="flex w-64 max-w-full items-center gap-4">
      <input
        id={inputId}
        type="range"
        aria-label={label}
        aria-valuetext={text}
        min={range?.min ?? 0}
        max={range?.max ?? 1}
        step={range?.step ?? 1}
        value={displayed ?? range?.min ?? 0}
        disabled={!state.writable || !range || displayed === null}
        className="h-6 min-w-0 flex-1 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) =>
          runtime.setValue(id, event.currentTarget.valueAsNumber)
        }
      />
      <output
        htmlFor={inputId}
        className="min-w-16 text-right text-sm font-medium tabular-nums"
      >
        <ControlValue
          id={id}
          state={state}
          runtime={runtime}
          label={label}
          text={text}
        />
      </output>
    </div>
  );
}
