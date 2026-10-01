import * as React from "react";
import {
  useController,
  type FieldPath,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";

import { IconGrid, type IconComponent } from "../IconGrid";
import { FieldShell } from "./FieldShell";

type IconGridControllerProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  K extends string,
> = UseControllerProps<TFieldValues, TName> & {
  icons: Record<K, IconComponent>;
  label?: React.ReactNode;
  description?: React.ReactNode;
  /** Offers a "none" cell that sets the field to `null`. */
  noneLabel?: string;
};

/** A field holding one key of an icon vocabulary, or `null`. */
export function IconGridController<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
  K extends string,
>({
  icons,
  label,
  description,
  noneLabel,
  ...controllerProps
}: IconGridControllerProps<TFieldValues, TName, K>) {
  const { field, fieldState } = useController(controllerProps);

  return (
    <FieldShell
      id={field.name}
      invalid={fieldState.invalid}
      label={label}
      description={description}
      error={fieldState.error}
    >
      <div
        role="group"
        aria-label={typeof label === "string" ? label : undefined}
      >
        <IconGrid
          icons={icons}
          value={(field.value as K | null | undefined) ?? null}
          onChange={field.onChange}
          noneLabel={noneLabel}
        />
      </div>
    </FieldShell>
  );
}
