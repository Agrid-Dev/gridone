import { FC, useId } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { FieldShell } from "../controllers/FieldShell";
import { Button } from "@/components/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface UserPickerProps {
  /** Currently selected user ids. */
  value: string[];
  onChange: (userIds: string[]) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

/** Reusable multi-select picker over the user directory. Renders a Popover
 *  with a searchable, checkable list; selected ids are toggled in/out of
 *  ``value`` and surfaced through ``onChange``. */
export const UserPicker: FC<UserPickerProps> = ({
  value,
  onChange,
  label,
  placeholder,
  required,
  id,
}) => {
  const { t } = useTranslation("common");
  const reactId = useId();
  const fieldId = id ?? reactId;

  const { users, usersMap, isLoading } = useUsers();

  const resolvedLabel = label ?? t("pickers.user.label");
  const resolvedPlaceholder = placeholder ?? t("pickers.user.placeholder");

  const toggle = (userId: string) => {
    if (value.includes(userId)) {
      onChange(value.filter((id) => id !== userId));
    } else {
      onChange([...value, userId]);
    }
  };

  if (isLoading) {
    return (
      <FieldShell id={fieldId} label={resolvedLabel} required={required}>
        <Skeleton className="h-10 w-full" />
      </FieldShell>
    );
  }

  const selectedLabel =
    value.length === 0
      ? resolvedPlaceholder
      : value
          .map(
            (userId) =>
              usersMap.get(userId)?.name || usersMap.get(userId)?.username,
          )
          .filter(Boolean)
          .join(", ");

  return (
    <FieldShell id={fieldId} label={resolvedLabel} required={required}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={fieldId}
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span
              className={cn(
                "truncate",
                value.length === 0 && "text-muted-foreground",
              )}
            >
              {selectedLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={t("pickers.user.search")} />
            <CommandList>
              <CommandEmpty>{t("pickers.user.noUsers")}</CommandEmpty>
              <CommandGroup>
                {users.map((user) => {
                  const selected = value.includes(user.id);
                  return (
                    <CommandItem
                      key={user.id}
                      value={`${user.name} ${user.username}`}
                      onSelect={() => toggle(user.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex items-baseline gap-2">
                        <span>{user.name || user.username}</span>
                        {user.name && (
                          <span className="text-xs text-muted-foreground">
                            {user.username}
                          </span>
                        )}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
};

export default UserPicker;
