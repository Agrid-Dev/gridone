import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";
import { REFRESH_INTERVALS, type RefreshInterval } from "./refreshPreference";

/** Cadence → its label key, spelled out so i18next's typed keys apply. */
const INTERVAL_LABEL_KEYS = {
  0: "history.refresh.off",
  10_000: "history.refresh.10s",
  60_000: "history.refresh.1m",
  300_000: "history.refresh.5m",
} as const satisfies Record<RefreshInterval, string>;

/** Manual "refresh now" button + auto-refresh cadence picker. The history
 *  queries never refetch on their own; this control is the only clock. */
export function RefreshControl() {
  const { t } = useTranslation("devices");
  const { refreshInterval, setRefreshInterval, refreshNow, isRefreshing } =
    useDeviceHistoryContext();

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="sm"
        className="h-9 w-9"
        aria-label={t("history.refresh.now")}
        onClick={() => void refreshNow()}
      >
        <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-2.5 text-xs tabular-nums"
            aria-label={t("history.refresh.auto")}
          >
            {t(INTERVAL_LABEL_KEYS[refreshInterval])}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={String(refreshInterval)}
            onValueChange={(value) =>
              setRefreshInterval(Number(value) as RefreshInterval)
            }
          >
            {REFRESH_INTERVALS.map((interval) => (
              <DropdownMenuRadioItem key={interval} value={String(interval)}>
                {t(INTERVAL_LABEL_KEYS[interval])}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
