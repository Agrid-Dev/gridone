import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDraftReport } from "../useDraftReport";
import type { CustomActionFormProps } from "../../presenters/types";
import { inlineWriteOf, type InlineWrite } from "../../presenters/commandShape";

/** The inline arm of the command action. The API validates the shape (a
 *  template id or an inline write, never both); this only guards what the
 *  form can leave blank. */
const schema = z.object({
  device_id: z.string().nullable(),
  attribute: z.string().trim().min(1),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

export function useInlineWriteForm({
  initialValue,
  onChange,
}: CustomActionFormProps) {
  const initial = initialValue ? inlineWriteOf(initialValue) : null;
  const form = useForm<InlineWrite>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      device_id: initial?.device_id ?? null,
      attribute: initial?.attribute ?? "",
      value: initial?.value ?? false,
    },
  });
  const value = form.watch();
  const parsed = schema.safeParse(value);
  const report = useCallback(
    (values: InlineWrite | null) =>
      onChange(
        values
          ? {
              provider_id: "command_template",
              params: { ...values, device_id: values.device_id || null },
            }
          : null,
      ),
    [onChange],
  );
  useDraftReport(parsed.success ? parsed.data : null, report);
  return form;
}
