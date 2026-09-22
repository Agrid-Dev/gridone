import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { WriteExpression } from "@gridone/sdk";
import { useDraftReport } from "../useDraftReport";
import type { CustomActionFormProps } from "../../presenters/types";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

type Values = {
  device_id: string | null;
  attribute: string;
  value: WriteExpression;
};

export function useWriteAttributeForm({
  initialValue,
  onChange,
}: CustomActionFormProps) {
  const client = useGridoneClient();
  const schemas = useQuery({
    queryKey: ["automations", "action-schemas"],
    queryFn: () => client.automations.getActionSchemas(),
    staleTime: Infinity,
  });
  const schema = useMemo(
    () =>
      schemas.data?.write_attribute
        ? (z.fromJSONSchema(schemas.data.write_attribute) as z.ZodType<
            Values,
            Values
          >)
        : (z.never() as z.ZodType<Values, Values>),
    [schemas.data],
  );
  const params =
    initialValue?.provider_id === "write_attribute"
      ? initialValue.params
      : undefined;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      device_id:
        typeof params?.device_id === "string" ? params.device_id : null,
      attribute: typeof params?.attribute === "string" ? params.attribute : "",
      value: (params?.value as WriteExpression | undefined) ?? false,
    },
  });
  const value = form.watch();
  const parsed = schema.safeParse(value);
  const report = useCallback(
    (values: Values | null) =>
      onChange(
        values
          ? {
              provider_id: "write_attribute",
              params: { ...values, device_id: values.device_id || null },
            }
          : null,
      ),
    [onChange],
  );
  useDraftReport(parsed.success ? parsed.data : null, report);
  return { form, isLoading: schemas.isPending, isError: schemas.isError };
}
