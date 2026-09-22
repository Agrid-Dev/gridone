import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Check, Search } from "lucide-react";
import type { DeviceAttributeRef } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { cn } from "@/lib/utils";
import { catalogAttribute, type AttributeCatalog } from "./expressions";
import { useAttributeSearch } from "./useAttributeSearch";

/** Search every device reference before limiting the rendered results for large fleets. */
export function AttributeSelect({
  value,
  onChange,
  catalog,
  label,
  writable = false,
  className,
}: {
  value: DeviceAttributeRef;
  onChange: (value: DeviceAttributeRef) => void;
  catalog: AttributeCatalog;
  label: string;
  writable?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("operatingRules");
  const attributeLabel = useAttributeLabel();
  const search = useAttributeSearch(catalog, writable);
  const selected = catalogAttribute(catalog, value);
  const device = catalog.devices.find(
    (device) => device.id === value.device_id,
  );
  const broken =
    !!value.device_id &&
    (!selected ||
      (writable &&
        (!Array.isArray(selected.read_write_modes) ||
          !selected.read_write_modes.includes("write"))));
  const messageId = useId();
  const popupId = useId();
  const selectedLabel = broken
    ? t("missing", { id: `${value.device_id}/${value.attribute}` })
    : selected
      ? `${device?.name} · ${attributeLabel(value.attribute, selected)}`
      : t("chooseDeviceAttribute");

  return (
    <span className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Popover open={search.open} onOpenChange={search.setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label={label}
            aria-expanded={search.open}
            aria-haspopup="dialog"
            aria-controls={search.open ? popupId : undefined}
            aria-invalid={broken}
            aria-describedby={broken ? messageId : undefined}
            className={cn(
              "w-full justify-between gap-2 font-normal",
              broken && "border-destructive text-destructive",
            )}
          >
            <span className="truncate">{selectedLabel}</span>
            <Search
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          id={popupId}
          aria-label={label}
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-72 max-w-[calc(100vw-2rem)] p-0"
        >
          <Command shouldFilter={false} label={t("searchAttributes")}>
            <CommandInput
              aria-label={t("searchAttributes")}
              placeholder={t("searchAttributes")}
              value={search.query}
              onValueChange={search.setQuery}
            />
            <CommandList label={label}>
              <CommandEmpty>{t("noAttributes")}</CommandEmpty>
              {search.attributes.map((option) => (
                <CommandItem
                  key={option.key}
                  value={option.key}
                  onSelect={() => {
                    onChange(option.reference);
                    search.setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.reference.device_id}/{option.reference.attribute}
                    </span>
                  </span>
                  {value.device_id === option.reference.device_id &&
                    value.attribute === option.reference.attribute && (
                      <Check aria-hidden="true" />
                    )}
                </CommandItem>
              ))}
            </CommandList>
            {search.overflow > 0 && (
              <p
                className="border-t px-3 py-2 text-xs text-muted-foreground"
                role="status"
              >
                {t("moreAttributes", { count: search.overflow })}
              </p>
            )}
          </Command>
        </PopoverContent>
      </Popover>
      {broken && (
        <span id={messageId} className="text-xs text-destructive">
          {t("brokenAttribute", {
            device: value.device_id,
            attribute: value.attribute,
          })}
        </span>
      )}
    </span>
  );
}
