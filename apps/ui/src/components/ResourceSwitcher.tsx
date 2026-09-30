import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
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
import { cn } from "@/lib/utils";

type ResourceOption = {
  id: string;
  name: string;
  description?: string | null;
};

/** Include the id for duplicate names; trim as cmdk trims each item's value. */
const optionValue = (resource: ResourceOption) =>
  `${resource.name} ${resource.description ?? ""} ${resource.id}`.trim();

/** A page title opening a searchable list, with the keyboard cursor on the
 *  current resource. Both dashboards and synoptics use this navigation. */
export function ResourceSwitcher({
  current,
  resources,
  labels,
  onNavigate,
  disabled = false,
  renderOptionSuffix,
  footer,
}: {
  current: ResourceOption;
  resources: ResourceOption[];
  labels: { label: string; search: string; empty: string; current: string };
  onNavigate: (id: string) => void;
  disabled?: boolean;
  renderOptionSuffix?: (id: string) => ReactNode;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-resource-switcher
          disabled={disabled}
          title={current.name}
          className="relative -left-2 flex min-w-0 max-w-full items-center gap-2 rounded-md px-2 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 data-[state=open]:bg-muted"
        >
          <span className="truncate">{current.name}</span>
          <ChevronDown
            aria-hidden
            className="h-5 w-5 shrink-0 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-96 max-w-[var(--radix-popover-content-available-width)] p-0"
      >
        <Command
          label={labels.label}
          defaultValue={optionValue(
            resources.find((resource) => resource.id === current.id) ?? current,
          )}
        >
          <CommandInput placeholder={labels.search} />
          <CommandList className="max-h-96">
            <CommandEmpty>{labels.empty}</CommandEmpty>
            <CommandGroup>
              {resources.map((resource) => (
                <CommandItem
                  key={resource.id}
                  value={optionValue(resource)}
                  data-resource-option={resource.id}
                  onSelect={() => {
                    setOpen(false);
                    if (!disabled && resource.id !== current.id)
                      onNavigate(resource.id);
                  }}
                >
                  <Check
                    aria-hidden
                    className={cn(
                      resource.id === current.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {resource.name}
                    </span>
                    {resource.id === current.id && (
                      <span className="sr-only">{labels.current}</span>
                    )}
                    {resource.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {resource.description}
                      </span>
                    )}
                  </span>
                  {renderOptionSuffix?.(resource.id)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {footer && <div className="border-t p-1">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}
