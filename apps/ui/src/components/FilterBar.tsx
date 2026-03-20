import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui";
import { ListFilter, X } from "lucide-react";
import { DeviceType } from "@/api/devices";

const ALL = "__all__";

const DEVICE_TYPES = Object.values(DeviceType);

export function TypeFilter() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const type = searchParams.get("type") ?? undefined;

  const handleChange = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === ALL) {
        next.delete("type");
      } else {
        next.set("type", value);
      }
      return next;
    });
  };

  const handleClear = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("type");
      return next;
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative mr-2">
        <ListFilter className="h-4 w-4 text-muted-foreground" />
        {type && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
        )}
      </div>
      <Select value={type ?? ALL} onValueChange={handleChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder={t("common.type")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("common.allTypes")}</SelectItem>
          {DEVICE_TYPES.map((dt) => (
            <SelectItem key={dt} value={dt}>
              {t(`common.deviceTypes.${dt}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {type && (
        <Button variant="ghost" size="icon" onClick={handleClear}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
