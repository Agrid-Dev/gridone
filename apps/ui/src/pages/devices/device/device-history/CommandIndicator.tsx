import { useTranslation } from "react-i18next";
import { ArrowRight, User as UserIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatValue } from "@/lib/formatValue";
import type { UnitCommand, User } from "@gridone/sdk";
import type { CellValue } from "./mergeTimeSeries";

type CommandIndicatorProps = {
  command: UnitCommand;
  user?: User;
  previousValue?: CellValue;
  newValue?: CellValue;
  dataType?: string;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "";
}

export function CommandIndicator({
  command,
  user,
  previousValue,
  newValue,
  dataType,
}: CommandIndicatorProps) {
  const { t } = useTranslation("devices");
  const initials = user?.name ? getInitials(user.name) : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
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
      <PopoverContent className="w-56 space-y-2 p-3 text-sm" side="top">
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
              {formatValue(previousValue, dataType)}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="font-semibold text-foreground">
              {formatValue(newValue, dataType)}
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
      </PopoverContent>
    </Popover>
  );
}
