import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Boxes } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DeviceGroup } from "@/hooks/useDeviceGroups";
import { cn } from "@/lib/utils";

/** Sentinel for "this device only" — a group tag value is 32 hex characters,
 *  so it can never collide with it. */
const THIS_DEVICE = "self";

/**
 * Where the settings changed on this page are sent: the device itself
 * (the default) or exactly one of the groups it belongs to. One target at a
 * time — a command is never split across two.
 *
 * It is a bar in the controls' own surface language, sitting tight against
 * them, because a bare label on the page background read as chrome: nothing
 * said it governed everything below it. Targeting a group tints the bar and
 * hands it the send action, so the scope is impossible to leave by accident.
 */
export function DeviceCommandTarget({
  groups,
  value,
  onChange,
  disabled,
  memberLabel,
  action,
}: {
  groups: DeviceGroup[];
  /** The selected group's tag value, or null for the device alone. */
  value: string | null;
  onChange: (group: string | null) => void;
  disabled?: boolean;
  /** How many devices the selected group holds, in business vocabulary — the
   *  reach of the next gesture, known before it rather than only on the
   *  confirmation screen. */
  memberLabel?: string | null;
  /** What the bar offers once there is something to send. */
  action?: ReactNode;
}) {
  const { t } = useTranslation("devices");
  const id = useId();
  if (!groups.length) return null;
  const targeted = value !== null;
  return (
    <div
      data-targeting={targeted ? "group" : "device"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-2.5 pl-3.5 shadow-sm",
        targeted ? "border-primary/40 bg-accent" : "bg-card",
      )}
    >
      <Boxes
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          targeted ? "text-accent-foreground" : "text-muted-foreground",
        )}
      />
      <label
        className={cn(
          "text-sm font-medium",
          targeted ? "text-accent-foreground" : "text-muted-foreground",
        )}
        htmlFor={id}
      >
        {t("commandTarget.label")}
      </label>
      <Select
        value={value ?? THIS_DEVICE}
        onValueChange={(next) =>
          onChange(next === THIS_DEVICE ? null : (next ?? null))
        }
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-9 w-auto min-w-64 font-medium">
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
      {targeted && memberLabel && (
        <span className="text-sm font-medium text-accent-foreground">
          {memberLabel}
        </span>
      )}
      {!targeted && (
        <span className="ml-auto text-sm text-muted-foreground">
          {t("commandTarget.availableGroups", { count: groups.length })}
        </span>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}
