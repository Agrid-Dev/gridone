import { useTranslation } from "react-i18next";
import { Power, PowerOff } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { AttributeValue } from "@/components/AttributeValue";
import { EmptyValue } from "@/components/EmptyValue";
import { deviceMode } from "@/lib/deviceSummary";
import { type DeviceType } from "@/lib/devices";
import { cn } from "@/lib/utils";

/** A device's operating mode as icon + label ("Heating", "Off"), shared by
 *  the fleet table and cards. Enum modes go through {@link AttributeValue} so
 *  they carry the same icon and semantic colour as everywhere else; on/off is
 *  composed here because it is not a wire mode value. */
export function DeviceModeValue({
  device,
  className,
}: {
  device: Device;
  className?: string;
}) {
  const { t } = useTranslation();
  const mode = deviceMode(device);
  if (!mode) return <EmptyValue />;

  if (mode.kind === "onoff") {
    const Icon = mode.value === "on" ? Power : PowerOff;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-[0.4em]",
          mode.value === "off" && "text-muted-foreground",
          className,
        )}
      >
        <Icon className="size-[1.15em] shrink-0" aria-hidden />
        <span>{t(`common.hvacMode.${mode.value}`)}</span>
      </span>
    );
  }

  return (
    <AttributeValue
      attributeName={mode.attribute}
      deviceType={device.type as DeviceType}
      value={mode.value}
      className={className}
    />
  );
}
