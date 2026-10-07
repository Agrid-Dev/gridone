import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DataType } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { isEmptyFilter, type DevicesFilter } from "@/lib/devices";
import { compareText } from "@/lib/sortByName";
import { useAttributeCoverage } from "./useAttributeCoverage";

type AttributeCoverageSelectProps = {
  /** Device set the coverage is computed over. */
  filter: DevicesFilter;
  value?: string;
  onChange: (attribute: string, dataType: DataType) => void;
  /** Only offer attributes writable on at least one matched device. */
  writableOnly?: boolean;
  disabled?: boolean;
  id?: string;
};

/** Searchable controlled selector of an attribute over a device set. Options are the
 *  UNION of the set's attributes annotated with coverage ("8/12"); devices
 *  not exposing the chosen attribute are excluded server-side at dispatch.
 *  Attributes with mixed data types across the set cannot be targeted and
 *  render disabled. */
export function AttributeCoverageSelect({
  filter,
  value,
  onChange,
  writableOnly,
  disabled,
  id,
}: AttributeCoverageSelectProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation("common");
  const labelFor = useAttributeLabel();
  const { coverage, totalDevices } = useAttributeCoverage(filter, {
    enabled: !disabled && !isEmptyFilter(filter),
  });

  const options = useMemo(
    () =>
      coverage
        .filter((row) => !writableOnly || row.writable_count > 0)
        .map((row) => ({ row, label: labelFor(row.attribute, row) }))
        .sort((a, b) => compareText(a.label, b.label)),
    [coverage, writableOnly, labelFor],
  );

  const selectedLabel = value
    ? (options.find(({ row }) => row.attribute === value)?.label ??
      labelFor(value))
    : t("pickers.attribute.placeholder");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={selectedLabel}
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {selectedLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <Command
          label={t("pickers.attribute.search")}
          filter={filterAttributeOption}
        >
          <CommandInput placeholder={t("pickers.attribute.search")} />
          <CommandList className="max-h-[min(300px,calc(var(--radix-popover-content-available-height)-3rem))]">
            <CommandEmpty>{t("pickers.attribute.noMatching")}</CommandEmpty>
            <CommandGroup>
              {options.map(({ row, label }) => {
                const mixed = row.data_types.length > 1;
                return (
                  <CommandItem
                    key={row.attribute}
                    value={row.attribute}
                    keywords={[label]}
                    disabled={mixed}
                    onSelect={() => {
                      if (row.data_types.length !== 1) return;
                      onChange(row.attribute, row.data_types[0]);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(value !== row.attribute && "opacity-0")}
                    />
                    <span className="min-w-0 whitespace-normal break-words">
                      {label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {mixed
                          ? t("pickers.attribute.mixedTypes")
                          : `(${row.data_types[0]})`}{" "}
                        {t("pickers.attribute.coverage", {
                          count: writableOnly
                            ? row.writable_count
                            : row.device_count,
                          total: totalDevices,
                        })}
                        {row.unit && ` · ${row.unit}`}
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
