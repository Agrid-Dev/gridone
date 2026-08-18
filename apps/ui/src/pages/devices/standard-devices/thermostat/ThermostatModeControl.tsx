import { useTranslation } from "react-i18next";
import { lookupValueRenderer } from "@/components/AttributeValue";
import { DeviceType } from "@/lib/devices";
import { cn } from "@/lib/utils";

type ThermostatModeControlProps = {
  /** Currently active mode wire value, if any. */
  value: string | null;
  /** Mode wire values to offer, in display order (see resolveModeOptions). */
  options: string[];
  saving: boolean;
  onSelect: (mode: string) => void;
};

/** Segmented mode picker (Chauffage | Froid | Auto…): a radiogroup of pill
 *  buttons where the active segment lifts on a background pill tinted with
 *  the mode's semantic colour. */
export function ThermostatModeControl({
  value,
  options,
  saving,
  onSelect,
}: ThermostatModeControlProps) {
  const { t } = useTranslation();
  const { t: tDevices } = useTranslation("devices");

  return (
    <div
      role="radiogroup"
      aria-label={tDevices("controls.thermostat.modePickerLabel")}
      className="flex w-full rounded-full bg-muted p-1"
    >
      {options.map((mode) => {
        const renderer = lookupValueRenderer(
          DeviceType.Thermostat,
          "mode",
          mode,
        );
        const Icon = renderer?.Icon;
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={saving}
            onClick={() => !active && onSelect(mode)}
            className={cn(
              "flex min-w-0 flex-auto items-center justify-center gap-1 rounded-full px-2 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
              active
                ? cn(
                    "bg-background shadow-sm",
                    renderer?.color ?? "text-foreground",
                  )
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            {t(`common.hvacMode.${mode}`, { defaultValue: mode })}
          </button>
        );
      })}
    </div>
  );
}
