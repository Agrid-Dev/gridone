import { Thermometer, Fan, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import type { DeviceType } from "@/api/devices";

const typeConfig: Record<
  string,
  { icon: typeof Thermometer; className: string }
> = {
  thermostat: {
    icon: Thermometer,
    className: "text-orange-700 border-orange-200",
  },
  awhp: {
    icon: Fan,
    className: "text-blue-700 border-blue-200",
  },
};

const fallback = {
  icon: HelpCircle,
  className: "bg-gray-100 text-gray-500 border-gray-200",
};

export function DeviceTypeChip({ type }: { type: DeviceType | null }) {
  const { t } = useTranslation();
  const config = type ? (typeConfig[type] ?? fallback) : fallback;
  const Icon = config.icon;
  const label = type ? t(`common.deviceTypes.${type}`) : t("common.unknown");

  return (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
