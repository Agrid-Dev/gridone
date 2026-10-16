import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TimeRange } from "@/lib/timeRange";
import {
  customRangeSchema,
  localDateTime,
  localToUtc,
} from "@/lib/customTimeRange";

export function useCustomTimeRangeForm(
  timeRange: TimeRange,
  onApply: (range: TimeRange) => void,
) {
  const original =
    timeRange.kind === "custom" ? timeRange : { start: "", end: "" };
  const form = useForm({
    resolver: zodResolver(customRangeSchema),
    defaultValues: {
      start: localDateTime(original.start),
      end: localDateTime(original.end),
    },
  });
  const submit = form.handleSubmit(({ start, end }) => {
    onApply({
      kind: "custom",
      start: localToUtc(start, original.start),
      end: localToUtc(end, original.end),
    });
  });
  return { form, submit };
}
