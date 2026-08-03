import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";
import { Check, ChevronsUpDown } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { FieldShell } from "./FieldShell";

type MultiSelectOption = {
  value: string;
  label: string;
};

type MultiSelectControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  options: ReadonlyArray<MultiSelectOption>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
};

/** Multi-select over a closed set of options — the array counterpart of
 *  ``SelectController``. Holds a `string[]` field and toggles values in and
 *  out of it from a searchable, checkable Popover.
 *
 *  The Popover+Command shell below is the third copy of the same markup
 *  (`UserPicker`, `AssetPicker`); they differ only in where the options come
 *  from and how each row renders. Extracting the shared shell is deliberately
 *  deferred to the array support work (AGR-922) — the moment this widget
 *  enters the `schema-form` registry — rather than done piecemeal here. */
export function MultiSelectController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  label,
  description,
  required,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  ...controllerProps
}: MultiSelectControllerProps<TFieldValues, TName>) {
  const { field, fieldState } = useController(controllerProps);
  const id = field.name;

  const selected: string[] = Array.isArray(field.value) ? field.value : [];
  const toggle = (value: string) =>
    field.onChange(
      selected.includes(value)
        ? selected.filter((current) => current !== value)
        : [...selected, value],
    );

  const summary =
    selected.length === 0
      ? placeholder
      : selected
          .map(
            (value) => options.find((o) => o.value === value)?.label ?? value,
          )
          .join(", ");

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      description={description}
      error={fieldState.error}
      required={required}
    >
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-invalid={fieldState.invalid}
            className="w-full justify-between font-normal"
          >
            <span
              className={cn(
                "truncate",
                selected.length === 0 && "text-muted-foreground",
              )}
            >
              {summary}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected.includes(option.value)
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </FieldShell>
  );
}
