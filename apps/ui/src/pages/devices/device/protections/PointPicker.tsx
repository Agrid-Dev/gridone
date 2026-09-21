import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DevicePointRef } from "@gridone/sdk";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import type { PointCatalog } from "./expressions";

export function EditorSelect({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </FieldShell>
  );
}

export function PointPicker({
  value,
  onChange,
  catalog,
  writable = false,
  fixedDevice = false,
}: {
  value: DevicePointRef;
  onChange: (value: DevicePointRef) => void;
  catalog: PointCatalog;
  writable?: boolean;
  fixedDevice?: boolean;
}) {
  const { t } = useTranslation("protections");
  const label = useAttributeLabel();
  const device = catalog.devices.find((d) => d.id === value.device_id);
  const attributes = Object.entries(device?.attributes ?? {}).filter(
    ([, attr]) =>
      !writable ||
      (Array.isArray(attr.read_write_modes) &&
        attr.read_write_modes.includes("write")),
  );
  const missingDevice = !!value.device_id && !device;
  const missingAttribute =
    !!value.attribute && !attributes.some(([name]) => name === value.attribute);
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <EditorSelect
          label={t("device")}
          value={value.device_id}
          onChange={(device_id) => onChange({ device_id, attribute: "" })}
          disabled={fixedDevice}
        >
          {missingDevice && (
            <SelectItem value={value.device_id}>
              {t("missing", { id: value.device_id })}
            </SelectItem>
          )}
          {catalog.devices.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name} · {d.id}
            </SelectItem>
          ))}
        </EditorSelect>
        <EditorSelect
          label={t("attribute")}
          value={value.attribute}
          onChange={(attribute) => onChange({ ...value, attribute })}
          disabled={!value.device_id}
        >
          {missingAttribute && (
            <SelectItem value={value.attribute}>
              {t("missing", { id: value.attribute })}
            </SelectItem>
          )}
          {attributes.map(([name, attr]) => (
            <SelectItem key={name} value={name}>
              {label(name, attr)} · {name}
            </SelectItem>
          ))}
        </EditorSelect>
      </div>
      {(missingDevice || missingAttribute) && (
        <p className="text-sm text-destructive" role="status">
          {t("brokenPoint", {
            device: value.device_id,
            attribute: value.attribute,
          })}
        </p>
      )}
    </div>
  );
}
