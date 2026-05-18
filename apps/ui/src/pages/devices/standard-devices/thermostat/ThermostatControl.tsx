import { useTranslation } from "react-i18next";
import { Loader2, Minus, Plus, Power } from "lucide-react";
import { isThermostat, readThermostatAttributes } from "@/api/devices";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ControlPanel } from "../ControlPanel";
import { ThermostatDial } from "./ThermostatDial";
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
    <ControlPanel
      size="sm"
      modeChip={
        <div className="flex items-center gap-2">
          {attrs.mode && <Badge variant="info">{attrs.mode}</Badge>}
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-wider",
              isOn ? "text-emerald-600" : "text-muted-foreground",
            )}
          >
            {isOn ? t("controls.thermostat.on") : t("controls.thermostat.off")}
          </span>
        </div>
      }
      footer={
        <button
          type="button"
          aria-label={
            isOn
              ? t("controls.thermostat.turnOff")
              : t("controls.thermostat.turnOn")
          }
          disabled={powerSaving}
          onClick={() => changeAndSaveNow("onoffState", !isOn)}
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50",
            isOn
              ? "bg-orange-100 text-orange-700 hover:bg-orange-200"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {powerSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          {isOn
            ? t("controls.thermostat.turnOff")
            : t("controls.thermostat.turnOn")}
        </button>
      }
    >
      <div className="flex flex-col items-center gap-8">
        <ThermostatDial
          setpoint={setpoint}
          currentTemp={attrs.temperature}
          min={min}
          max={max}
          saving={setpointSaving}
          step={STEP}
          onSetpointChange={(value) =>
            changeAndSave("temperatureSetpoint", value)
          }
        />

        <div className="flex items-center justify-center gap-10">
          {min != null && (
            <button
              type="button"
              aria-label={t("controls.thermostat.decreaseSetpoint")}
              disabled={!canDecrement || setpointSaving}
              onClick={() =>
                setpoint != null &&
                changeAndSave("temperatureSetpoint", setpoint - STEP)
              }
              className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 disabled:opacity-40"
            >
              <Minus className="h-5 w-5" />
            </button>
          )}
          {max != null && (
            <button
              type="button"
              aria-label={t("controls.thermostat.increaseSetpoint")}
              disabled={!canIncrement || setpointSaving}
              onClick={() =>
                setpoint != null &&
                changeAndSave("temperatureSetpoint", setpoint + STEP)
              }
              className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/80 disabled:opacity-40"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </ControlPanel>
  );
}
