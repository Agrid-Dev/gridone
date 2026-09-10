import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { Button, Switch } from "@/components/ui";
import { toLabel } from "@/lib/textFormat";
import { cn } from "@/lib/utils";
import { localize } from "../face";
import type { BoundControlState, DeviceUiRuntime } from "../runtime";
import type { WriteState } from "../runtime";
import { decimalsOf } from "../runtime/controls";
import { formatNumber } from "./formatters";

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
        if (!state) return null;
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
  const label = localize(state.spec.label, language);
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      data-control={id}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <WriteStateIndicator state={state.write} />
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
  switch (state.spec.kind) {
    case "toggle":
      return (
        <Switch
          aria-label={label}
          checked={state.displayed === true}
          disabled={!state.writable}
          onCheckedChange={(checked) => runtime.setValue(id, checked)}
        />
      );
    case "number":
      return (
        <NumberStepper id={id} state={state} runtime={runtime} label={label} />
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
      : t("presentation.unavailable");
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
          {value}
          {unit && typeof state.displayed === "number" ? ` ${unit}` : ""}
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
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex max-w-full flex-wrap rounded-full bg-muted p-1"
    >
      {state.options.map((option) => {
        const active = option === state.displayed;
        return (
          <label key={String(option)} className="relative min-w-0">
            <input
              type="radio"
              name={name}
              checked={active}
              disabled={!state.writable}
              aria-label={toLabel(String(option))}
              className="peer sr-only"
              onChange={() => runtime.setValue(id, option)}
            />
            <span
              className={cn(
                "block rounded-full px-3 py-1.5 text-sm font-medium transition-colors peer-disabled:opacity-50 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-foreground/80 hover:text-foreground",
              )}
            >
              {toLabel(String(option))}
            </span>
          </label>
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
