import { useTranslation } from "react-i18next";
import { CommandConfirmationDetails } from "@/components/CommandConfirmationDetails";
import { ArrowRight, User as UserIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { attributeValueText } from "@/lib/attributeValueLabel";
import type { UnitCommand, User, ValueLabel } from "@gridone/sdk";
import type { CellValue } from "@/lib/mergeTimeSeries";

type CommandIndicatorProps = {
  command: UnitCommand;
  user?: User;
  attributeName: string;
  previousValue?: CellValue;
  newValue?: CellValue;
  dataType?: string;
  /** Unit symbol appended to a numeric value. */
  unit?: string | null;
  /** The driver's wording of a boolean's two states, when it declares one. */
  valueLabels?: ValueLabel[] | null;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "";
}

/**
 * Marks a value a command wrote: the author's initials inline, and on
 * demand who, when, the value before and after — worded as the supervision
 * pages word them — the outcome and its confirmation details.
 */
export function CommandIndicator({
  command,
  user,
  attributeName,
  previousValue,
  newValue,
  dataType,
  unit,
  valueLabels,
}: CommandIndicatorProps) {
  const { t } = useTranslation("devices");
  const { t: tCommon, i18n } = useTranslation("common");
  const initials = user?.name ? getInitials(user.name) : null;

  const wording = (value: CellValue) => {
    const text = attributeValueText(attributeName, value, tCommon, {
      dataType,
      valueLabels,
      language: i18n.language,
    });
    return typeof value === "number" && unit ? `${text} ${unit}` : text;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={user?.name || user?.username || command.user_id}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            "text-[10px] font-medium leading-none",
            "bg-primary/10 text-primary hover:bg-primary/20",
            "cursor-pointer transition-colors",
          )}
        >
          {initials ?? <UserIcon className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className={cn(
          "space-y-2 p-3 text-sm",
          command.ui_confirmation ? "w-80" : "w-56",
        )}
        side="top"
      >
        <div>
          <p className="font-medium">
            {user?.name || user?.username || command.user_id}
          </p>
          {user?.title && <p className="text-muted-foreground">{user.title}</p>}
          {command.executed_at && (
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(command.executed_at).toLocaleString()}
            </p>
          )}
        </div>
        {previousValue !== undefined && newValue !== undefined && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">
              {wording(previousValue)}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="font-semibold text-foreground">
              {wording(newValue)}
            </span>
          </div>
        )}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            {t("commands.status")}:{" "}
            <span
              className={cn(
                "font-medium",
                command.status === "success"
                  ? "text-green-600"
                  : "text-destructive",
              )}
            >
              {command.status}
            </span>
          </p>

          {command.status_details && (
            <p className="text-destructive">{command.status_details}</p>
          )}
        </div>
        <CommandConfirmationDetails command={command} />
      </PopoverContent>
    </Popover>
  );
}
