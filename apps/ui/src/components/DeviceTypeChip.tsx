import { Thermometer, Fan } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { DeviceType } from "@/api/devices";

const typeConfig: Record<
  DeviceType,
  { icon: typeof Thermometer; className: string }
> = {
  [DeviceType.Thermostat]: {
    icon: Thermometer,
    className: "text-orange-700 border-orange-200",
  },
  [DeviceType.Awhp]: {
    icon: Fan,
    className: "text-blue-700 border-blue-200",
  },
};

export function DeviceTypeChip({ type }: { type: DeviceType | null }) {
  const { t } = useTranslation();
  if (!type) return null;

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {t(`common.deviceTypes.${type}`)}
    </Badge>
  );
}
