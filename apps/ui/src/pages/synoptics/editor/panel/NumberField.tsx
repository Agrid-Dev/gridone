import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

type NumberFieldProps = Omit<
  ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "min" | "max"
> & {
  /** The stored number, or null when none is set: the field then reads
   *  blank, and its placeholder can say what that means. */
  value: number | null;
  min?: number;
  max?: number;
  /** Called with a whole number in range, once the author is done: on
   *  blur or Enter, never mid-typing. */
  onCommit: (value: number) => void;
  /** Optional fields may clear their stored value when an empty entry is
   *  committed. Without this, an empty entry restores the stored number. */
  onClear?: () => void;
};

/**
 * A whole-number field that holds what is typed until the author is done
 * with it. A document field set on every keystroke would pass through the
 * values typed on the way ("1" of "12"), and a collector port whose offset
 * reads blank leaves its run with nowhere to attach. Escape and an
 * unreadable entry give the stored value back; an empty entry does too
 * unless the field explicitly allows clearing.
 *
 * What is typed lives only until it is committed: the field then shows
 * the stored value again, so a number the editor refused (a bar grown into
 * another body) does not linger as if it were taken, nor get committed a
 * second time when the field loses focus.
 */
export function NumberField({
  value,
  min,
  max,
  onCommit,
  onClear,
  onBlur,
  onKeyDown,
  ...props
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (input: HTMLInputElement) => {
    if (draft === null) return;
    setDraft(null);
    // Browsers expose incomplete numbers (such as "1e") as an empty value.
    // They must not clear an optional field as if it were deliberately erased.
    if (input.validity.badInput) return;
    if (draft.trim() === "") {
      if (value !== null) onClear?.();
      return;
    }
    const n = Math.trunc(Number(draft));
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(max ?? n, Math.max(min ?? n, n));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <Input
      {...props}
      type="number"
      inputMode="numeric"
      step={1}
      min={min}
      max={max}
      value={draft ?? (value === null ? "" : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit(e.currentTarget);
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget);
        } else if (e.key === "Escape") {
          setDraft(null);
        }
        onKeyDown?.(e);
      }}
    />
  );
}
