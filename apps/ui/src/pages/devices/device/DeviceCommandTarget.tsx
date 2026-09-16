import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeviceGroup } from "@/hooks/useDeviceGroups";

/** Sentinel for "this device only" — a group tag value is 32 hex characters,
 *  so it can never collide with it. */
const THIS_DEVICE = "self";

/**
 * Where the settings changed on this page are sent: the device itself
 * (the default) or exactly one of the groups it belongs to. One target at a
 * time — a command is never split across two.
 */
export function DeviceCommandTarget({
  groups,
  value,
  onChange,
  disabled,
}: {
  groups: DeviceGroup[];
  /** The selected group's tag value, or null for the device alone. */
  value: string | null;
  onChange: (group: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("devices");
  const id = useId();
  if (!groups.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm text-muted-foreground" htmlFor={id}>
        {t("commandTarget.label")}
      </label>
      <Select
        value={value ?? THIS_DEVICE}
        onValueChange={(next) =>
          onChange(next === THIS_DEVICE ? null : (next ?? null))
        }
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-auto min-w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={THIS_DEVICE}>
            {t("commandTarget.thisDevice")}
          </SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.value} value={group.value}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
