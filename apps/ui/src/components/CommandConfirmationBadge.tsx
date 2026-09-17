import type { UnitCommand } from "@gridone/sdk";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CommandConfirmationDetails } from "./CommandConfirmationDetails";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/** Compact history indicator; evidence is readable without expanding the table row. */
export function CommandConfirmationBadge({
  command,
}: {
  command: UnitCommand;
}) {
  const { t } = useTranslation("devices");
  if (!command.ui_confirmation) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex text-muted-foreground hover:text-foreground"
          title={t("confirmation.accepted")}
          aria-label={t("confirmation.accepted")}
        >
          <ShieldCheck className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <CommandConfirmationDetails command={command} />
      </PopoverContent>
    </Popover>
  );
}
