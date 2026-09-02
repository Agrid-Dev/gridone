import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";

import { FieldShell } from "./FieldShell";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type SelectOption<V> = {
  value: V;
  label: React.ReactNode;
  disabled?: boolean;
};

/** Radix Select reserves `""` for "nothing selected" and throws on an item
 *  carrying it, so the optional empty item is keyed by a sentinel that is
 *  mapped back to `emptyValue` on change. */
const EMPTY_KEY = "__empty__";

type SelectControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TValue = string,
> = UseControllerProps<TFieldValues, TName> & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
  options: ReadonlyArray<SelectOption<TValue>>;
  placeholder?: React.ReactNode;
  /** Adds a first item that resets the field to `emptyValue`. */
  allowEmpty?: boolean;
  emptyValue?: undefined | "" | null;
  emptyLabel?: React.ReactNode;
  title?: string;
  orientation?: React.ComponentProps<typeof FieldShell>["orientation"];
  selectProps?: Omit<
    React.ComponentProps<typeof Select>,
    "value" | "defaultValue" | "onValueChange" | "disabled"
  >;
  triggerProps?: Omit<
    React.ComponentProps<typeof SelectTrigger>,
    "id" | "aria-invalid" | "disabled"
  >;
  contentProps?: React.ComponentProps<typeof SelectContent>;
};

export function SelectController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  TValue = string,
>({
  label,
  description,
  options,
  placeholder = "Select…",
  allowEmpty = false,
  emptyValue = undefined,
  emptyLabel = "None",
  required,
  selectProps,
  triggerProps,
  contentProps,
  title,
  orientation,
  ...controllerProps
}: SelectControllerProps<TFieldValues, TName, TValue>) {
  const { field, fieldState } = useController(controllerProps);

  const id = field.name;

  // Radix Select speaks strings; we key items by String(value) and resolve the
  // selected key back to the option's native value so the field keeps its type.
  // An empty field shows the empty item when there is one, the placeholder
  // otherwise.
  const isEmpty =
    field.value === undefined || field.value === null || field.value === "";
  const value = isEmpty ? (allowEmpty ? EMPTY_KEY : "") : String(field.value);

  return (
    <FieldShell
      id={id}
      invalid={fieldState.invalid}
      label={label}
      required={required}
      description={description}
      error={fieldState.error}
      orientation={orientation}
    >
      <Select
        {...selectProps}
        value={value}
        onValueChange={(key) => {
          if (allowEmpty && key === EMPTY_KEY)
            return field.onChange(emptyValue);
          const selected = options.find((o) => String(o.value) === key);
          field.onChange(selected ? selected.value : key);
        }}
        disabled={field.disabled}
        required={required}
      >
        <SelectTrigger
          {...triggerProps}
          id={id}
          aria-invalid={fieldState.invalid}
          disabled={field.disabled}
          title={title}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent {...contentProps}>
          {allowEmpty && (
            <SelectItem value={EMPTY_KEY}>
              <span className="opacity-70">{emptyLabel}</span>
            </SelectItem>
          )}

          {options.map((opt) => (
            <SelectItem
              key={String(opt.value)}
              value={String(opt.value)}
              disabled={opt.disabled}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}
