import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, Power, Loader2 } from "lucide-react";
import {
  DeviceType,
  isThermostat,
  readThermostatAttributes,
} from "@/api/devices";
import {
  AttributeValue,
  lookupValueRenderer,
} from "@/components/AttributeValue";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
import { cn } from "@/lib/utils";
import {
  Button,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import type { StandardControlProps } from "../registry";

const STEP = 0.5;

export function ThermostatControl({
  device,
  draft,
  onDraftChange,
}: StandardControlProps) {
  const { t } = useTranslation("devices");

  const { changeAndSave, changeAndSaveNow, isSaving } =
    useDebouncedAttributeWrite({
      deviceId: device.id,
      onDraftChange,
    });

  if (!isThermostat(device)) return null;
  const attrs = readThermostatAttributes(device);

  const setpoint =
    draft.temperatureSetpoint != null
      ? Number(draft.temperatureSetpoint)
      : attrs.temperatureSetpoint;

  const isOn = draft.onoffState != null ? Boolean(draft.onoffState) : false;
  const min = attrs.temperatureSetpointMin;
  const max = attrs.temperatureSetpointMax;
  // min/max optional: clamp only in the direction that has a bound.
  const canIncrement =
    setpoint != null && (max == null || setpoint + STEP <= max);
  const canDecrement =
    setpoint != null && (min == null || setpoint - STEP >= min);

  const powerSaving = isSaving("onoffState");
  const setpointSaving = isSaving("temperatureSetpoint");

  const modeRenderer = lookupValueRenderer(
    DeviceType.Thermostat,
    "mode",
    attrs.mode as string,
  );
  const onColor = modeRenderer?.color ?? "text-primary";

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-xs items-center justify-center overflow-hidden rounded-2xl border bg-card shadow-md">
      {/* Mode-tinted glow: blooms when on, drains to nothing when off. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current blur-3xl transition-opacity duration-500",
          onColor,
          isOn ? "opacity-20" : "opacity-0",
        )}
      />
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
        {attrs.mode ? (
          <AttributeValue
            deviceType={DeviceType.Thermostat}
            attributeName="mode"
            value={attrs.mode}
            className={cn(
              "text-xs uppercase tracking-widest transition-colors",
              !isOn && "text-muted-foreground",
            )}
          />
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-xs font-medium transition-colors",
              isOn ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isOn ? t("controls.thermostat.on") : t("controls.thermostat.off")}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={
                  isOn
                    ? t("controls.thermostat.turnOff")
                    : t("controls.thermostat.turnOn")
                }
                disabled={powerSaving}
                onClick={() => changeAndSaveNow("onoffState", !isOn)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 disabled:opacity-50",
                  isOn
                    ? cn(
                        onColor,
                        "border-current",
                        "bg-[color-mix(in_srgb,currentColor_5%,transparent)]",
                      )
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {powerSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isOn
                ? t("controls.thermostat.turnOff")
                : t("controls.thermostat.turnOn")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Center: current temp + setpoint controls */}
      <div className="relative z-10 flex flex-col items-start gap-4">
        {attrs.temperature != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("controls.thermostat.current")}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {Number(attrs.temperature).toFixed(1)}°
            </span>
          </div>
        )}

        <div>
          <span className="mb-[-6px] block text-xs uppercase tracking-widest text-muted-foreground">
            {t("controls.thermostat.setpoint")}
          </span>
          <div className="flex items-center gap-1">
            <div
              className={`flex items-start transition-opacity duration-1000 ${setpointSaving ? "animate-pulse" : ""}`}
            >
              <span
                className={cn(
                  "text-5xl font-extralight tabular-nums leading-none transition-colors",
                  !isOn && "text-muted-foreground",
                )}
              >
                {setpoint != null ? Number(setpoint).toFixed(1) : "—"}
              </span>
              <span className="text-lg text-muted-foreground">°</span>
            </div>
            <div className="flex flex-col">
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("controls.thermostat.increaseSetpoint")}
                disabled={!canIncrement || setpointSaving}
                onClick={() =>
                  setpoint != null &&
                  changeAndSave("temperatureSetpoint", setpoint + STEP)
                }
              >
                <ChevronUp className="!h-8 !w-8 text-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("controls.thermostat.decreaseSetpoint")}
                disabled={!canDecrement || setpointSaving}
                onClick={() =>
                  setpoint != null &&
                  changeAndSave("temperatureSetpoint", setpoint - STEP)
                }
              >
                <ChevronDown className="!h-8 !w-8 text-foreground" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
