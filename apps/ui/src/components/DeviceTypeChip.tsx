import { Thermometer, Fan, CloudSun, Zap, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { DeviceType } from "@/api/devices";

export const DEVICE_TYPE_ICONS: Record<DeviceType, typeof Thermometer> = {
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Awhp]: Fan,
  [DeviceType.WeatherSensor]: CloudSun,
  [DeviceType.ElectricityMeter]: Zap,
};

export function deviceTypeIcon(
  type: DeviceType | string | null | undefined,
): typeof Thermometer | null {
  if (!type) return null;
  return DEVICE_TYPE_ICONS[type as DeviceType] ?? CircleHelp;
}

type DeviceTypeChipProps = {
  type: DeviceType | string | null;
};

export function DeviceTypeChip({ type }: DeviceTypeChipProps) {
  const { t } = useTranslation();
  if (!type) return null;

  const Icon = deviceTypeIcon(type) ?? CircleHelp;

  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="h-3 w-3" />
      {t(`common.deviceTypes.${type}`, { defaultValue: type })}
    </Badge>
  );
}
