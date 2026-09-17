import { optionStates } from "@/components/device-ui/runtime/controls";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { Scalar } from "@/components/device-ui/conditions";
import type { GroupAttribute } from "./groupAttributes";

export function useGroupTargetForm(
  attribute: GroupAttribute,
  onStage: (value: Scalar) => void,
  initialValue?: Scalar | null,
) {
  const { t } = useTranslation("devices");
  const options =
    attribute.data_type === "bool"
      ? [false, true]
      : (optionStates(attribute)
          ?.filter((option) => option.available)
          .map((option) => option.value) ?? []);
  const schema = z.object({
    value: z
      .string()
      .trim()
      .min(1)
      .refine((value) => {
        if (options.length)
          return options.some((option) => String(option) === value);
        if (attribute.data_type === "int")
          return Number.isInteger(Number(value));
        if (attribute.data_type === "float")
          return Number.isFinite(Number(value));
        return true;
      }, t("groups.invalidValue")),
  });
  const form = useForm<{ value: string }>({
    resolver: zodResolver(schema),
    defaultValues: { value: initialValue == null ? "" : String(initialValue) },
  });
  const submit = form.handleSubmit(({ value }) => {
    const target = options.length
      ? options.find((option) => String(option) === value)!
      : attribute.data_type === "int" || attribute.data_type === "float"
        ? Number(value)
        : value;
    onStage(target);
  });
  return { options, form, submit };
}
