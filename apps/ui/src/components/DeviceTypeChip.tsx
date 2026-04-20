import { Thermometer, Fan, CloudSun, CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { DeviceType } from "@/api/devices";

const ICONS: Record<DeviceType, typeof Thermometer> = {
  [DeviceType.Thermostat]: Thermometer,
  [DeviceType.Awhp]: Fan,
  [DeviceType.WeatherSensor]: CloudSun,
};

type DeviceTypeChipProps = {
  type: DeviceType | string | null;
};

export function DeviceTypeChip({ type }: DeviceTypeChipProps) {
  const { t } = useTranslation();
  if (!type) return null;

  const Icon = ICONS[type as DeviceType] ?? CircleHelp;

  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="h-3 w-3" />
      {t(`common.deviceTypes.${type}`, { defaultValue: type })}
    </Badge>
  );
}
