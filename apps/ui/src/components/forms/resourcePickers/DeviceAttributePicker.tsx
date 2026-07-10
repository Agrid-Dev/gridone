import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FC, useId, useMemo } from "react";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import {
  deviceAttributes,
  type DeviceAttribute,
  type DevicesFilter,
} from "@/lib/devices";
import type { AttributeFields } from "@/lib/faults";
import { FieldShell } from "../controllers/FieldShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toLabel } from "@/lib/textFormat";
import { DevicePicker } from "./DevicePicker";

interface DeviceAttributePickerProps {
  deviceId: string | undefined;
  attribute: string | undefined;
  onChange: (next: { deviceId: string; attribute: string }) => void;
  attributeFilter?: (attr: DeviceAttribute) => boolean;
  deviceLabel?: string;
  attributeLabel?: string;
  deviceFilter?: DevicesFilter;
  required?: boolean;
  disabled?: boolean;
}

export const DeviceAttributePicker: FC<DeviceAttributePickerProps> = ({
  deviceId,
  attribute,
  onChange,
  attributeFilter,
  deviceLabel,
  attributeLabel,
  deviceFilter,
  required,
  disabled,
}) => {
  const { t } = useTranslation("common");
  const client = useGridoneClient();
  const attributeFieldId = useId();

  // Singular key — `["devices", undefined]` collides with `useDevicesList`'s
  // cache, and `enabled: false` doesn't prevent reading existing cached data.
  const { data: device } = useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => client.devices.get(deviceId!),
    enabled: !!deviceId,
  });

  const allowedAttributes = useMemo(
    () => filterAttributes(device, attributeFilter),
    [device, attributeFilter],
  );

  const handleDeviceSelect = (selected: Device | null) => {
    if (!selected) {
      onChange({ deviceId: "", attribute: "" });
      return;
    }
    // Preserve the attribute if it still exists & matches the filter on the
    // new device. Inline rather than via useEffect so live device polling can't
    // race the user's selection.
    const allowedOnNewDevice = filterAttributes(selected, attributeFilter);
    const stillValid =
      !!attribute && allowedOnNewDevice.some((a) => a.name === attribute);
    onChange({
      deviceId: selected.id,
      attribute: stillValid ? attribute : "",
    });
  };

  const handleAttributeChange = (next: string) => {
    if (!deviceId) return;
    onChange({ deviceId, attribute: next });
  };

  const resolvedAttributeLabel = attributeLabel ?? t("pickers.attribute.label");

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
      <DevicePicker
        value={deviceId}
        onSelect={handleDeviceSelect}
        filter={deviceFilter}
        label={deviceLabel}
        required={required}
        disabled={disabled}
      />
      <FieldShell
        id={attributeFieldId}
        label={resolvedAttributeLabel}
        required={required}
      >
        <AttributeSelectBody
          deviceId={deviceId}
          device={device}
          attribute={attribute}
          attributes={allowedAttributes}
          onChange={handleAttributeChange}
          fieldId={attributeFieldId}
          disabled={disabled}
        />
      </FieldShell>
    </div>
  );
};

function filterAttributes(
  device: Device | undefined,
  attributeFilter: ((a: DeviceAttribute) => boolean) | undefined,
): AttributeFields[] {
  if (!device) return [];
  const all = Object.values(deviceAttributes(device));
  return (
    attributeFilter ? all.filter(attributeFilter) : all
  ) as AttributeFields[];
}

interface AttributeSelectBodyProps {
  deviceId: string | undefined;
  device: Device | undefined;
  attribute: string | undefined;
  attributes: AttributeFields[];
  onChange: (next: string) => void;
  fieldId: string;
  disabled?: boolean;
}

const AttributeSelectBody: FC<AttributeSelectBodyProps> = ({
  deviceId,
  device,
  attribute,
  attributes,
  onChange,
  fieldId,
  disabled,
}) => {
  const { t } = useTranslation("common");

  if (!deviceId) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("pickers.attribute.pickDeviceFirst")}
      </p>
    );
  }
  if (!device) {
    return <Skeleton className="h-10 w-full" />;
  }
  if (attributes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("pickers.attribute.noMatching")}
      </p>
    );
  }
  return (
    <Select
      value={attribute ?? ""}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger id={fieldId}>
        <SelectValue placeholder={t("pickers.attribute.placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {attributes.map((attr) => (
          <SelectItem key={attr.name} value={attr.name}>
            <span>{toLabel(attr.name)}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              ({attr.data_type})
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default DeviceAttributePicker;
