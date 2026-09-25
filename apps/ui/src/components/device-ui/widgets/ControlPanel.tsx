import { useEffect, useState } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AttributeDependencies } from "@/components/AttributeDependencies";
import { moveRadioFocus } from "@/lib/radioNavigation";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import {
  Button,
  Switch,
  Tooltip,
  TooltipArrow,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
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
    <div className="px-4 py-3" data-control={id}>
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        </div>
        <ControlInput id={id} state={state} runtime={runtime} label={label} />
      </div>
      <ControlFeedback state={state} runtime={runtime} language={language} />
    </div>
  );
}

/**
 * Write status and availability explanations shared by standalone controls
 * and setpoint tables. While every missing dependency is one this page is
 * writing, the explanations from before the write stay on screen: the gap is
 * ours, and the page must not move for it.
 */
export function ControlFeedback({
  state,
  runtime,
  language,
}: {
  state: BoundControlState;
  runtime: DeviceUiRuntime;
  language?: string;
}) {
  const writeState = state.attribute?.write_state;
  const awaiting = state.awaiting ?? [];
  const missing = (writeState?.missing_attributes ?? []).filter(
    (name) => !awaiting.includes(name),
  );
  const onlyAwaiting = awaiting.length > 0 && missing.length === 0;
  const current = {
    reasons: commandReasons(state.reasons, language),
    warnings: commandReasons(writeState?.warnings, language),
  };
  const [settled, setSettled] = useState(current);
  if (
    !onlyAwaiting &&
    (settled.reasons !== current.reasons ||
      settled.warnings !== current.warnings)
  )
    setSettled(current);
  const { reasons, warnings } = onlyAwaiting ? settled : current;
  const label = (name: string) => runtime.attributeLabel?.(name) ?? name;
  return (
    <>
      <ControlStatus state={state.write} awaiting={awaiting.map(label)} />
      {reasons && (
        <p role="status" className="text-xs text-muted-foreground">
          {reasons}
        </p>
      )}
      {writeState?.missing_dependencies &&
        !onlyAwaiting &&
        runtime.deviceId && (
          <AttributeDependencies
            deviceId={runtime.deviceId}
            attribute={state.spec.attribute}
            labels={missing.map(label)}
          />
        )}
      {warnings && <p className="text-xs text-amber-700">{warnings}</p>}
    </>
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
  const known =
    minimum !== null && maximum !== null ? { minimum, maximum } : null;
  // While the bounds are unknown the last known ones stay, greyed, in place.
  const [lastKnown, setLastKnown] = useState(known);
  if (
    known &&
    (known.minimum !== lastKnown?.minimum ||
      known.maximum !== lastKnown?.maximum)
  )
    setLastKnown(known);
  const range = known ?? lastKnown;
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
        {range && (
          <p
            data-stale={!known || undefined}
            className={cn(
              "text-[11px] text-muted-foreground",
              !known && "opacity-50",
            )}
          >
            {t("presentation.range", {
              min: formatNumber(range.minimum, decimals, i18n.language),
              max: formatNumber(range.maximum, decimals, i18n.language),
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
        return (
          <OptionButton
            key={`${typeof option}:${String(option)}`}
            label={optionLabel(option)}
            active={active}
            unavailable={unavailable}
            reason={commandReasons(resolved?.reasons, i18n.language)}
            reasonId={`${id}-option-${index}-reason`}
            onSelect={() => runtime.setValue(id, option)}
          />
        );
      })}
    </div>
  );
}

/**
 * An option's reason is a tooltip, so reasons coming and going never resize
 * the group. Hover and focus open it; a tap on an unavailable option opens it
 * too, since touch has neither.
 */
function OptionButton({
  label,
  active,
  unavailable,
  reason,
  reasonId,
  onSelect,
}: {
  label: string;
  active: boolean;
  unavailable: boolean;
  reason: string;
  reasonId: string;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);
  // The trigger stays mounted when a reason comes or goes, so focus is kept.
  return (
    <>
      <Tooltip open={open && !!reason} onOpenChange={setOpen} delayDuration={0}>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={unavailable}
            aria-describedby={reason ? reasonId : undefined}
            onClick={(event) => {
              if (!unavailable) onSelect();
              else if (reason) {
                // Keeps the tooltip trigger from closing what the tap opens.
                event.preventDefault();
                setOpen(true);
              }
            }}
            onKeyDown={moveRadioFocus}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
              unavailable && "opacity-50",
              active && "bg-background shadow-sm",
            )}
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipPrimitive.Portal>
          <TooltipContent side="top" className="max-w-72 text-xs">
            {reason}
            <TooltipArrow className="fill-popover" />
          </TooltipContent>
        </TooltipPrimitive.Portal>
      </Tooltip>
      {reason && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </>
  );
}

export const CONFIRMED_VISIBLE_MS = 2000;

/**
 * The outcome of the last write, announced politely: sending, confirmed,
 * or the real failure, else the dependencies whose write is awaited.
 * Measurements are never announced here. The line always keeps one line of
 * height and never widens its container; a long message is cut, in full in
 * its title. "Applied" fades out without giving its line back.
 */
function ControlStatus({
  state,
  awaiting,
}: {
  state: WriteState;
  awaiting: string[];
}) {
  const { t } = useTranslation("devices");
  const [faded, setFaded] = useState<WriteState | null>(null);
  useEffect(() => {
    if (state.kind !== "confirmed") return;
    const timer = setTimeout(() => setFaded(state), CONFIRMED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [state]);
  const failed = state.kind === "error" || state.kind === "unconfirmed";
  const waiting = !failed && state.kind !== "sending" && awaiting.length > 0;
  const text = waiting
    ? t("presentation.awaiting", { names: awaiting.join(", ") })
    : state.kind === "sending"
      ? t("presentation.sending")
      : state.kind === "confirmed"
        ? t("presentation.confirmed")
        : state.kind === "error"
          ? t("presentation.error", { message: state.message })
          : state.kind === "unconfirmed"
            ? t("presentation.unconfirmed", { message: state.message })
            : "";
  return (
    <p
      role="status"
      aria-live="polite"
      data-write-state={state.kind}
      title={text || undefined}
      className={cn(
        "h-4 w-0 min-w-full truncate text-xs leading-4 transition-opacity duration-500",
        failed ? "text-destructive" : "text-muted-foreground",
        !waiting && faded === state && "opacity-0",
      )}
    >
      {(waiting || state.kind === "sending") && (
        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />
      )}
      {!waiting && state.kind === "confirmed" && (
        <Check className="mr-1 inline h-3 w-3" aria-hidden />
      )}
      {text}
    </p>
  );
}
