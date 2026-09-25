import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { ConnectionStatusDot } from "@/components/ConnectionStatusBadge";
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
import { useCanSeeConnectionStatus } from "@/hooks/useCanSeeConnectionStatus";
import { getConnectionStatus } from "@/lib/devices";
import { cn } from "@/lib/utils";

/** What the search matches a device on; the id keeps two devices of the
 *  same name apart. */
const optionValue = (d: Device) => `${d.name} ${d.type ?? ""} ${d.id}`.trim();
/** The value of the "no device" row: no device matches it. */
const NONE = "__none__";

/**
 * Which device a symbol is: a searchable list of the site's devices, with
 * their connection state for those allowed to see it. Picking one is what
 * the plate's click-through and fault badge follow; the readings are bound
 * slot by slot underneath.
 */
export function DeviceCombobox({
  id,
  value,
  devices,
  onChange,
}: {
  id?: string;
  value: string | null;
  devices: Device[];
  onChange: (deviceId: string | null) => void;
}) {
  const { t } = useTranslation("synoptics");
  const [open, setOpen] = useState(false);
  const canSeeStatus = useCanSeeConnectionStatus();
  const current = devices.find((d) => d.id === value);
  const dot = (device: Device) =>
    canSeeStatus ? (
      <ConnectionStatusDot
        status={getConnectionStatus(device)}
        className="shrink-0"
      />
    ) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-label={t("editor.device.label")}
          aria-expanded={open}
          className="flex h-10 w-full items-center gap-2 rounded-md border bg-background px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {current && dot(current)}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              !value && "text-muted-foreground",
            )}
          >
            {current?.name ?? (value ? value : t("editor.device.none"))}
          </span>
          <ChevronsUpDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-72 p-0"
      >
        <Command label={t("editor.device.label")}>
          <CommandInput placeholder={t("editor.device.search")} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t("editor.device.empty")}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={NONE}
                onSelect={() => {
                  setOpen(false);
                  onChange(null);
                }}
              >
                <Check
                  aria-hidden
                  className={cn(value ? "opacity-0" : "opacity-100")}
                />
                <span className="text-muted-foreground">
                  {t("editor.device.none")}
                </span>
              </CommandItem>
              {devices.map((device) => (
                <CommandItem
                  key={device.id}
                  value={optionValue(device)}
                  data-device-option={device.id}
                  onSelect={() => {
                    setOpen(false);
                    onChange(device.id);
                  }}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      device.id === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {dot(device)}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{device.name}</span>
                    {device.type && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {device.type}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
