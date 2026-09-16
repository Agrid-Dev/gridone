import { moveRadioFocus } from "@/lib/radioNavigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { Button, Switch } from "@/components/ui";
import { attributeValueLabel } from "@/lib/attributeValueLabel";
import { commandReasons } from "@/lib/commandReasons";
import { toLabel } from "@/lib/textFormat";
import { cn } from "@/lib/utils";
import type { Scalar } from "../conditions";
import { localize } from "../face";
import type { BoundControlState, DeviceUiRuntime } from "../runtime";
import type { WriteState } from "../runtime";
import { decimalsOf } from "../runtime/controls";
import { formatNumber } from "./formatters";
import { NumberSlider } from "./NumberSlider";
import { ControlValue } from "./ControlValue";
import { DescriptionHint, describedAttributes } from "./DescriptionHint";

/**
 * Generic controls of a presentation: a toggle, a number stepper or a
 * select, each driven by the shared runtime. What a control may do comes
 * from the attribute contract (see `runtime/controls.ts`); this file only
 * renders the state and forwards intentions.
 */

export type ControlPanelProps = {
  controls: string[];
  runtime: DeviceUiRuntime;
  language: string;
};

export function ControlPanel({
  controls,
  runtime,
  language,
}: ControlPanelProps) {
  return (
    <div className="divide-y divide-border rounded-lg border">
      {controls.map((id) => {
        const state = runtime.readControl(id);
        if (!state || state.visible === false) return null;
        return (
          <ControlRow
            key={id}
            id={id}
            state={state}
            runtime={runtime}
            language={language}
          />
        );
      })}
    </div>
  );
}

export function ControlRow({
  id,
  state,
  runtime,
  language,
}: {
  id: string;
  state: BoundControlState;
  runtime: DeviceUiRuntime;
  language: string;
}) {
  const { t } = useTranslation();
  const label = localize(state.spec.label, language);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      data-control={id}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {label}
          <DescriptionHint
            name={label}
            entries={describedAttributes(
              [{ caption: label, attribute: state.attribute }],
              language,
            )}
          />
        </p>
        {state.valueLabel && (
          <p className="text-xs text-muted-foreground">{state.valueLabel}</p>
        )}
        {state.spec.kind === "select" &&
          state.reported !== null &&
          !state.options.includes(state.reported) && (
            <p className="text-xs text-muted-foreground">
              {t("common.currentValue")}: {String(state.reported)}
            </p>
          )}
        <WriteStateIndicator state={state.write} />
        {state.reasons?.length ? (
          <p role="status" className="text-xs text-muted-foreground">
            {commandReasons(state.reasons, language)}
          </p>
        ) : null}
        {state.attribute?.write_state?.warnings?.length ? (
          <p className="text-xs text-amber-700">
            {commandReasons(state.attribute.write_state.warnings, language)}
          </p>
        ) : null}
      </div>
      <ControlInput id={id} state={state} runtime={runtime} label={label} />
    </div>
  );
}

function ControlInput({
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
  const { t } = useTranslation("devices");
  if (
    runtime.chooseValue &&
    state.spec.kind === "select" &&
    !state.options.length
  ) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={!state.writable}
        onClick={() => runtime.chooseValue?.(id)}
      >
        {t("groups.chooseTarget")}
      </Button>
    );
  }
  switch (state.spec.kind) {
    case "toggle": {
      // A mixed checkbox has a neutral thumb; activating it asks for an
      // explicit on/off target instead of treating missing reports as off.
      const unknown = !!runtime.chooseValue && state.displayed === null;
      return (
        <Switch
          aria-label={label}
          role={unknown ? "checkbox" : "switch"}
          aria-checked={unknown ? "mixed" : state.displayed === true}
          className={cn(unknown && "[&>span]:translate-x-2.5")}
          checked={state.displayed === true}
          disabled={
            !state.writable ||
            state.optionStates?.find(
              (option) => option.value === !(state.displayed === true),
            )?.available === false
          }
          onCheckedChange={(checked) =>
            unknown ? runtime.chooseValue?.(id) : runtime.setValue(id, checked)
          }
        />
      );
    }
    case "number":
      return (
        <NumberStepper id={id} state={state} runtime={runtime} label={label} />
      );
    case "slider":
      return (
        <NumberSlider id={id} state={state} runtime={runtime} label={label} />
      );
    case "select":
      return (
        <SelectControl id={id} state={state} runtime={runtime} label={label} />
      );
  }
}

export function NumberStepper({
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
  const { t, i18n } = useTranslation("devices");
  const step = state.constraints.step;
  const decimals = step === null ? undefined : decimalsOf(step);
  const value =
    typeof state.displayed === "number"
      ? formatNumber(state.displayed, decimals, i18n.language)
      : (state.valueLabel ?? t("presentation.unavailable"));
  const unit = state.attribute?.unit;
  const { minimum, maximum } = state.constraints;
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full"
        aria-label={t("presentation.decrease", { name: label })}
        disabled={!state.canDecrement}
        onClick={() => runtime.activate({ control: id, op: "decrement" })}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <div className="min-w-20 text-center">
        <span className="font-medium tabular-nums text-foreground">
          <ControlValue
            id={id}
            state={state}
            runtime={runtime}
            label={label}
            text={
              unit && typeof state.displayed === "number"
                ? `${value} ${unit}`
                : value
            }
          />
        </span>
        {minimum !== null && maximum !== null && (
          <p className="text-[11px] text-muted-foreground">
            {t("presentation.range", {
              min: formatNumber(minimum, decimals, i18n.language),
              max: formatNumber(maximum, decimals, i18n.language),
            })}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full"
        aria-label={t("presentation.increase", { name: label })}
        disabled={!state.canIncrement}
        onClick={() => runtime.activate({ control: id, op: "increment" })}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SelectControl({
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
  const { t, i18n } = useTranslation("common");
  // A standard enum value shows its business label; anything else keeps the
  // wire value prettified. What is sent is always the option itself.
  const optionLabel = (option: Scalar) =>
    attributeValueLabel(state.spec.attribute, option, t) ??
    toLabel(String(option));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {state.options.map((option, index) => {
        const active = option === state.displayed;
        const resolved = state.optionStates?.find(
          (item) => item.value === option,
        );
        const unavailable = !state.writable || resolved?.available === false;
        const reason = commandReasons(resolved?.reasons, i18n.language);
        const reasonId = `${id}-option-${index}-reason`;
        return (
          <div key={`${typeof option}:${String(option)}`}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={unavailable}
              aria-describedby={reason ? reasonId : undefined}
              onClick={() => {
                if (!unavailable) runtime.setValue(id, option);
              }}
              onKeyDown={moveRadioFocus}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                unavailable && "opacity-50",
                active && "bg-background shadow-sm",
              )}
            >
              {optionLabel(option)}
            </button>
            {reason && (
              <p
                id={reasonId}
                className="max-w-48 px-2 text-xs text-muted-foreground"
              >
                {reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The outcome of the last write, announced politely: sending, confirmed,
 * or the real failure. Measurements are never announced here.
 */
export function WriteStateIndicator({ state }: { state: WriteState }) {
  const { t } = useTranslation("devices");
  if (state.kind === "idle") return null;
  const failed = state.kind === "error" || state.kind === "unconfirmed";
  return (
    <p
      role="status"
      aria-live="polite"
      data-write-state={state.kind}
      className={cn(
        "flex items-center gap-1 text-xs",
        failed ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state.kind === "sending" && (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      )}
      {state.kind === "confirmed" && <Check className="h-3 w-3" aria-hidden />}
      {state.kind === "sending" && t("presentation.sending")}
      {state.kind === "confirmed" && t("presentation.confirmed")}
      {state.kind === "error" &&
        t("presentation.error", { message: state.message })}
      {state.kind === "unconfirmed" &&
        t("presentation.unconfirmed", { message: state.message })}
    </p>
  );
}
