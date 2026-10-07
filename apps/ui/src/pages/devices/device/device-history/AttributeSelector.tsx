import { useMemo } from "react";
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
import { filterAttributeOption } from "@/lib/attributeSearch";
import { compareText } from "@/lib/sortByName";
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
  const { availableAttributes, selectedAttributes, setSelectedAttributes } =
    useDeviceHistoryContext();

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
          <Command filter={filterAttributeOption}>
            <CommandInput placeholder={t("common:common.searchAttributes")} />
            <CommandList>
              <CommandEmpty>{t("common:common.noResults")}</CommandEmpty>
              <CommandGroup>
                <AttributeOptions />
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

/** The picker's rows, sorted by label for display only (the selection stays
 *  in device order). Mounted only while the popover is open, so live value
 *  updates don't relabel and re-sort a closed list. */
function AttributeOptions() {
  const {
    availableAttributes,
    selectedAttributes,
    attributes,
    toggleAttribute,
  } = useDeviceHistoryContext();
  const labelFor = useAttributeLabel();
  const options = useMemo(
    () =>
      availableAttributes
        .map((attribute) => ({
          attribute,
          label: labelFor(attribute, attributes[attribute]),
        }))
        .sort((a, b) => compareText(a.label, b.label)),
    [availableAttributes, attributes, labelFor],
  );
  const selected = new Set(selectedAttributes);

  return options.map(({ attribute, label }) => (
    <CommandItem
      key={attribute}
      value={attribute}
      keywords={[label]}
      onSelect={() => toggleAttribute(attribute)}
    >
      <Check
        className={cn(
          "h-4 w-4",
          selected.has(attribute) ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      {label}
    </CommandItem>
  ));
}
