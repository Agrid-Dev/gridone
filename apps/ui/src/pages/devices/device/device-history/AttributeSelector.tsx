import { useTranslation } from "react-i18next";
import { Check, Settings2 } from "lucide-react";
import { Button } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
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
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { cn } from "@/lib/utils";
import { useDeviceHistoryContext } from "./DeviceHistoryContext";

/** Above this attribute count, "select all" would trigger one points fetch
 *  per attribute (some AHUs expose ~600), so the action is disabled. Picking
 *  them one by one stays open: nothing is hidden, only the shortcut. */
export const MAX_SELECT_ALL_ATTRIBUTES = 20;

/**
 * The one selection both views share: every recorded attribute of the device,
 * numeric, boolean and text alike, searchable, with a count of the selected.
 */
export function AttributeSelector() {
  const { t } = useTranslation(["devices", "common"]);
  const {
    availableAttributes,
    selectedAttributes,
    attributes,
    toggleAttribute,
    setSelectedAttributes,
  } = useDeviceHistoryContext();
  const labelFor = useAttributeLabel();

  const selected = new Set(selectedAttributes);
  const allSelected =
    availableAttributes.length > 0 &&
    selectedAttributes.length === availableAttributes.length;
  const canSelectAll = availableAttributes.length <= MAX_SELECT_ALL_ATTRIBUTES;

  return (
    <div className="inline-flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings2 className="mr-2 h-4 w-4" />
            {t("common:common.columns")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder={t("common:common.searchAttributes")} />
            <CommandList>
              <CommandEmpty>{t("common:common.noResults")}</CommandEmpty>
              <CommandGroup>
                {availableAttributes.map((name) => {
                  const label = labelFor(name, attributes[name]);
                  return (
                    <CommandItem
                      key={name}
                      value={name}
                      keywords={[label]}
                      onSelect={() => toggleAttribute(name)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4",
                          selected.has(name) ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      {label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
                disabled={!allSelected && !canSelectAll}
                onClick={() =>
                  setSelectedAttributes(allSelected ? [] : availableAttributes)
                }
              >
                {allSelected
                  ? t("common:common.unselectAll")
                  : t("common:common.selectAll")}
              </Button>
              {!allSelected && !canSelectAll && (
                <p className="px-2 pb-1 text-xs text-muted-foreground">
                  {t("common:common.selectAllDisabledHint")}
                </p>
              )}
            </div>
          </Command>
        </PopoverContent>
      </Popover>
      <Badge variant="secondary" className="text-xs tabular-nums">
        {selectedAttributes.length} / {availableAttributes.length}
      </Badge>
    </div>
  );
}
