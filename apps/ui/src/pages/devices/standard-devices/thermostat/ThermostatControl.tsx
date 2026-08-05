import { useTranslation } from "react-i18next";
import { Loader2, Minus, Plus, Power } from "lucide-react";
import {
  DeviceType,
  deviceAttributes,
  isAttributeWritable,
  isThermostat,
  readThermostatAttributes,
} from "@/lib/devices";
import { lookupValueRenderer } from "@/components/AttributeValue";
import { useDebouncedAttributeWrite } from "@/hooks/useDebouncedAttributeWrite";
import type { AttributeFields } from "@/lib/faults";
import { cn } from "@/lib/utils";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui";
import type { StandardControlProps } from "../registry";
import { ThermostatDial } from "./ThermostatDial";
import { ThermostatModeControl } from "./ThermostatModeControl";
import { dialRange } from "./dialGeometry";
import { resolveModeOptions } from "./modeOptions";

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
    draft.temperature_setpoint != null
      ? Number(draft.temperature_setpoint)
      : attrs.temperatureSetpoint;

  const isOn = draft.onoff_state != null ? Boolean(draft.onoff_state) : false;
  const mode = draft.mode != null ? String(draft.mode) : attrs.mode;
  const min = attrs.temperatureSetpointMin;
  const max = attrs.temperatureSetpointMax;
  // min/max optional: clamp only in the direction that has a bound.
  const canIncrement =
    setpoint != null && (max == null || setpoint + STEP <= max);
  const canDecrement =
    setpoint != null && (min == null || setpoint - STEP >= min);

  const powerSaving = isSaving("onoff_state");
  const setpointSaving = isSaving("temperature_setpoint");

  const modeRenderer = lookupValueRenderer(
    DeviceType.Thermostat,
    "mode",
    mode as string,
  );
  const onColor = modeRenderer?.color ?? "text-primary";

  // Humidity is not part of the standard thermostat schema; some drivers
  // expose it as an extra attribute — shown when present, omitted otherwise.
  const humidity = deviceAttributes(device)["humidity"]?.current_value;

  const modeAttr = deviceAttributes(device)["mode"] as
    | AttributeFields
    | undefined;
  const modeWritable = modeAttr != null && isAttributeWritable(device, "mode");

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t("controls.thermostat.control")}</CardTitle>
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
                onClick={() => changeAndSaveNow("onoff_state", !isOn)}
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
      </CardHeader>

      <CardContent className="space-y-6">
        <ThermostatDial
          setpoint={setpoint != null ? Number(setpoint) : null}
          measured={
            attrs.temperature != null ? Number(attrs.temperature) : null
          }
          {...dialRange(min, max)}
          isOn={isOn}
          modeColorClass={onColor}
          saving={setpointSaving}
        />

        {/* Setpoint steppers flanking the humidity readout */}
        <div className="flex items-center justify-center gap-6">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={t("controls.thermostat.decreaseSetpoint")}
            disabled={!canDecrement || setpointSaving}
            onClick={() =>
              setpoint != null &&
              changeAndSave("temperature_setpoint", Number(setpoint) - STEP)
            }
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-24 text-center text-sm text-muted-foreground">
            {typeof humidity === "number" && (
              <>
                {t("controls.thermostat.humidity")}{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {humidity.toFixed(0)} %
                </span>
              </>
            )}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={t("controls.thermostat.increaseSetpoint")}
            disabled={!canIncrement || setpointSaving}
            onClick={() =>
              setpoint != null &&
              changeAndSave("temperature_setpoint", Number(setpoint) + STEP)
            }
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {modeWritable && (
          <ThermostatModeControl
            value={mode != null ? String(mode) : null}
            options={resolveModeOptions(modeAttr)}
            saving={isSaving("mode")}
            onSelect={(next) => changeAndSaveNow("mode", next)}
          />
        )}
      </CardContent>
    </Card>
  );
}
