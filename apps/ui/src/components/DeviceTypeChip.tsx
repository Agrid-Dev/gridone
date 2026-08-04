import { CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import type { DeviceType } from "@/lib/devices";
import { deviceTypeIcon } from "@/lib/deviceTypes";

type DeviceTypeChipProps = {
  type: DeviceType | string | null | undefined;
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
