import { useId, type ReactNode } from "react";
import { FieldShell } from "@/components/forms/controllers/FieldShell";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function EditorSelect({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell id={id} label={label}>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </FieldShell>
  );
}
