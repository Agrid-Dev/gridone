import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { toLabel } from "@/lib/textFormat";
import type { Device } from "@/api/devices";
import type { User } from "@/api/users";

const ALL = "__all__";

type CommandsFilterBarProps = {
  deviceId?: string;
  attribute?: string;
  userId?: string;
  groupId?: string;
  attributeOptions: string[];
  devices: Device[];
  users: User[] | undefined;
  onFilterChange: (key: string, value: string | undefined) => void;
  isDeviceFixed?: boolean;
};

export function CommandsFilterBar({
  deviceId,
  attribute,
  userId,
  groupId,
  attributeOptions,
  devices,
  users,
  onFilterChange,
  isDeviceFixed = false,
}: CommandsFilterBarProps) {
  const { t } = useTranslation("devices");

  // When scoped to a group, every other filter is redundant — the batch is a
  // single dispatch at a single point in time. Show only the group chip so the
  // user can clear it (or dispatch a new command) to restore the full filter
  // bar.
  if (groupId) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          className="gap-1.5 px-2.5 py-1 font-mono text-xs"
        >
          <span className="text-muted-foreground">{t("commands.group")}:</span>
          <span>{groupId}</span>
          <button
            type="button"
            onClick={() => onFilterChange("group_id", undefined)}
            className="ml-1 rounded-sm text-muted-foreground hover:text-foreground"
            aria-label={t("commands.clearGroup")}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!isDeviceFixed && (
        <Select
          value={deviceId ?? ALL}
          onValueChange={(v) =>
            onFilterChange("device_id", v === ALL ? undefined : v)
          }
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("commands.allDevices")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("commands.allDevices")}</SelectItem>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name || d.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={attribute ?? ALL}
        onValueChange={(v) =>
          onFilterChange("attribute", v === ALL ? undefined : v)
        }
        disabled={!deviceId}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("commands.allAttributes")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("commands.allAttributes")}</SelectItem>
          {attributeOptions.map((attr) => (
            <SelectItem key={attr} value={attr}>
              {toLabel(attr)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={userId ?? ALL}
        onValueChange={(v) =>
          onFilterChange("user_id", v === ALL ? undefined : v)
        }
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("commands.allUsers")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("commands.allUsers")}</SelectItem>
          {users?.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <TimeRangeSelect onChangeParamsReset={["page"]} />
    </div>
  );
}
