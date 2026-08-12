import { CircleHelp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import type { DeviceType } from "@/lib/devices";
import { deviceTypeIcon, deviceTypeName } from "@/lib/deviceTypes";

type DeviceTypeChipProps = {
  type: DeviceType | string | null | undefined;
};

export function DeviceTypeChip({ type }: DeviceTypeChipProps) {
  const { t } = useTranslation("standardDevices");
  if (!type) return null;

  const Icon = deviceTypeIcon(type) ?? CircleHelp;

  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="h-3 w-3" />
      {deviceTypeName(type, t)}
    </Badge>
  );
}
