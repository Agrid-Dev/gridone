import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FC, useId } from "react";
import type { FieldError } from "react-hook-form";
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
import { deviceTypeIcon, deviceTypeName } from "@/lib/deviceTypes";
import { sortedByName } from "@/lib/sortByName";

interface DevicePickerProps {
  value: string | undefined;
  onSelect: (device: Device | null) => void;
  filter?: DevicesFilter;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  error?: FieldError;
  id?: string;
}

export const DevicePicker: FC<DevicePickerProps> = ({
  value,
  onSelect,
  filter,
  label,
  description,
  placeholder,
  required,
  disabled,
  invalid,
  error,
  id,
}) => {
  const { t } = useTranslation("common");
  const { t: tTypes } = useTranslation("standardDevices");
  const client = useGridoneClient();
  const reactId = useId();
  const fieldId = id ?? reactId;

  const { data: devices, isLoading } = useQuery({
    queryKey: ["devices", filter],
    queryFn: () => client.devices.list(devicesFilterToListParams(filter)),
  });

  const resolvedLabel = label ?? t("pickers.device.label");
  const resolvedPlaceholder = placeholder ?? t("pickers.device.placeholder");
  const shell = {
    id: fieldId,
    label: resolvedLabel,
    description,
    required,
    invalid,
    error,
  };

  if (isLoading) {
    return (
      <FieldShell {...shell}>
        <Skeleton className="h-10 w-full" />
      </FieldShell>
    );
  }

  if (!devices || devices.length === 0) {
    return (
      <FieldShell {...shell}>
        <p className="text-sm text-muted-foreground">
          {t("pickers.device.noDevices")}
        </p>
      </FieldShell>
    );
  }

  return (
    <FieldShell {...shell}>
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
                      {deviceTypeName(device.type, tTypes)}
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
