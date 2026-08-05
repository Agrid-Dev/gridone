import { useTranslation } from "react-i18next";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

/** CSV / PNG export of the displayed series (active metric + states). */
export function ExportMenu() {
  const { t } = useTranslation("devices");
  const { isDownloading, handleDownload } = useDeviceHistoryContext();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-9"
          disabled={isDownloading}
          aria-label={t("history.export")}
        >
          {isDownloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleDownload("csv")}>
          {t("deviceDetails.downloadCsv")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload("png")}>
          {t("deviceDetails.downloadPng")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
