import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, Power, Loader2 } from "lucide-react";
import { isThermostat, readThermostatAttributes } from "@/api/devices";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
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
  const canIncrement =
    setpoint != null && max != null && setpoint + STEP <= max;
  const canDecrement =
    setpoint != null && min != null && setpoint - STEP >= min;

  const powerSaving = isSaving("onoffState");
  const setpointSaving = isSaving("temperatureSetpoint");

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-xs items-center justify-center rounded-2xl border bg-card shadow-md">
      {/* Top bar: mode (left) — power (right) */}
      <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
        {attrs.mode ? (
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {attrs.mode}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-medium ${isOn ? "text-green-600" : "text-muted-foreground"}`}
          >
            {isOn ? t("thermostat.on") : t("thermostat.off")}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={
                  isOn ? t("thermostat.turnOff") : t("thermostat.turnOn")
                }
                disabled={powerSaving}
                onClick={() => changeAndSaveNow("onoffState", !isOn)}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 ${
                  isOn
                    ? "border-green-400 bg-green-50 text-green-600"
                    : "border-border bg-muted text-muted-foreground"
                } disabled:opacity-50`}
              >
                {powerSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Power className="h-4 w-4" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isOn ? t("thermostat.turnOff") : t("thermostat.turnOn")}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Center: current temp + setpoint controls */}
      <div className="flex flex-col items-start gap-4">
        {attrs.temperature != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {t("thermostat.current")}
            </span>
            <span className="text-sm font-medium tabular-nums">
              {Number(attrs.temperature).toFixed(1)}°
            </span>
          </div>
        )}

        <div>
          <span className="mb-[-6px] block text-xs uppercase tracking-widest text-muted-foreground">
            {t("thermostat.setpoint")}
          </span>
          <div className="flex items-center gap-1">
            <div
              className={`flex items-start transition-opacity duration-1000 ${setpointSaving ? "animate-pulse" : ""}`}
            >
              <span className="text-5xl font-extralight tabular-nums leading-none">
                {setpoint != null ? Number(setpoint).toFixed(1) : "—"}
              </span>
              <span className="text-lg text-muted-foreground">°</span>
            </div>
            <div className="flex flex-col">
              {max != null && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("thermostat.increaseSetpoint")}
                  disabled={!canIncrement || setpointSaving}
                  onClick={() =>
                    setpoint != null &&
                    changeAndSave("temperatureSetpoint", setpoint + STEP)
                  }
                >
                  <ChevronUp className="!h-8 !w-8 text-foreground" />
                </Button>
              )}
              {min != null && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("thermostat.decreaseSetpoint")}
                  disabled={!canDecrement || setpointSaving}
                  onClick={() =>
                    setpoint != null &&
                    changeAndSave("temperatureSetpoint", setpoint - STEP)
                  }
                >
                  <ChevronDown className="!h-8 !w-8 text-foreground" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
