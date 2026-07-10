import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FC, useId } from "react";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { devicesFilterToListParams, type DevicesFilter } from "@/lib/devices";
import { FieldShell } from "../controllers/FieldShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { deviceTypeIcon } from "@/components/DeviceTypeChip";
import { sortedByName } from "@/lib/sortByName";

interface DevicePickerProps {
  value: string | undefined;
  onSelect: (device: Device | null) => void;
  filter?: DevicesFilter;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

export const DevicePicker: FC<DevicePickerProps> = ({
  value,
  onSelect,
  filter,
  label,
  placeholder,
  required,
  disabled,
  id,
}) => {
  const { t } = useTranslation("common");
  const client = useGridoneClient();
  const reactId = useId();
  const fieldId = id ?? reactId;

  const { data: devices, isLoading } = useQuery({
    queryKey: ["devices", filter],
    queryFn: () => client.devices.list(devicesFilterToListParams(filter)),
  });

  const resolvedLabel = label ?? t("pickers.device.label");
  const resolvedPlaceholder = placeholder ?? t("pickers.device.placeholder");

  if (isLoading) {
    return (
      <FieldShell id={fieldId} label={resolvedLabel} required={required}>
        <Skeleton className="h-10 w-full" />
      </FieldShell>
    );
  }

  if (!devices || devices.length === 0) {
    return (
      <FieldShell id={fieldId} label={resolvedLabel} required={required}>
        <p className="text-sm text-muted-foreground">
          {t("pickers.device.noDevices")}
        </p>
      </FieldShell>
    );
  }

  return (
    <FieldShell id={fieldId} label={resolvedLabel} required={required}>
      <Select
        value={value ?? ""}
        onValueChange={(deviceId) => {
          const device = devices.find((d) => d.id === deviceId) ?? null;
          onSelect(device);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={fieldId}>
          <SelectValue placeholder={resolvedPlaceholder} />
        </SelectTrigger>
        <SelectContent>
          {sortedByName(devices).map((device) => {
            const Icon = deviceTypeIcon(device.type);
            return (
              <SelectItem key={device.id} value={device.id}>
                <span className="flex items-baseline gap-2">
                  <span>{device.name}</span>
                  {device.type && (
                    <span className="inline-flex items-baseline gap-1 text-xs text-muted-foreground">
                      {Icon && <Icon className="h-3 w-3" />}
                      {t(`common.deviceTypes.${device.type}`, {
                        defaultValue: device.type,
                      })}
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </FieldShell>
  );
};

export default DevicePicker;
