import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDeviceSearchParam } from "@/hooks/useDeviceSearchParam";

export function DeviceSearchField() {
  const { t } = useTranslation("devices");
  const { value, change, commit, clear } = useDeviceSearchParam();
  return (
    <div className="relative w-full max-w-full sm:w-72">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
      />
      <Input
        type="search"
        className="h-11 pl-9 pr-12"
        aria-label={t("devices.search.label")}
        placeholder={t("devices.search.placeholder")}
        value={value}
        onChange={(event) => change(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {value && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-11 w-11"
              aria-label={t("devices.search.clear")}
              title={t("devices.search.clear")}
              onClick={clear}
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("devices.search.clear")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
