import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import type { Device } from "@/api/devices";
import type { User } from "@/api/users";

const ALL = "__all__";

type CommandsFilterBarProps = {
  deviceId?: string;
  attribute?: string;
  userId?: string;
  attributeOptions: string[];
  devices: Device[];
  users: User[] | undefined;
  onFilterChange: (key: string, value: string | undefined) => void;
};

export function CommandsFilterBar({
  deviceId,
  attribute,
  userId,
  attributeOptions,
  devices,
  users,
  onFilterChange,
}: CommandsFilterBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3">
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
              {attr}
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
