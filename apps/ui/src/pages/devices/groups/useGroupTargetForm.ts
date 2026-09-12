import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import type { Scalar } from "@/components/device-ui/conditions";
import type { GroupAttribute } from "./groupAttributes";

export function useGroupTargetForm(
  attribute: GroupAttribute,
  onPrepare: (value: Scalar) => void,
) {
  const { t } = useTranslation("devices");
  const options =
    attribute.data_type === "bool"
      ? [false, true]
      : (attribute.value_options ?? []);
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
    defaultValues: { value: "" },
  });
  const submit = form.handleSubmit(({ value }) => {
    const target = options.length
      ? options.find((option) => String(option) === value)!
      : attribute.data_type === "int" || attribute.data_type === "float"
        ? Number(value)
        : value;
    onPrepare(target);
  });
  return { options, form, submit };
}
