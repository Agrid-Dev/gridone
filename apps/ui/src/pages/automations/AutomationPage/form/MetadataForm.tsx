import { FC } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { InputController } from "@/components/forms/controllers/InputController";
import { TextareaController } from "@/components/forms/controllers/TextAreaController";
import { SwitchController } from "@/components/forms/controllers/SwitchController";

const metadataSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string(),
  enabled: z.boolean(),
});

export type MetadataFormValues = z.infer<typeof metadataSchema>;

interface MetadataFormProps {
  initialValue: MetadataFormValues;
  onSubmit: (values: MetadataFormValues) => void;
  onCancel: () => void;
}

const MetadataForm: FC<MetadataFormProps> = ({
  initialValue,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation(["common", "automations"]);
  const { control, handleSubmit, formState } = useForm<MetadataFormValues>({
    resolver: zodResolver(metadataSchema),
    mode: "onChange",
    defaultValues: initialValue,
  });
  const enabled = useWatch({ control, name: "enabled" });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4">
        <InputController
          name="name"
          control={control}
          label={t("automations:fields.name")}
          required
        />
        <TextareaController
          name="description"
          control={control}
          label={t("automations:fields.description")}
        />
        <SwitchController
          name="enabled"
          control={control}
          label={t(
            enabled ? "automations:enabledBadge" : "automations:disabledBadge",
          )}
        />
      </div>

      <div className="flex align-middle justify-end gap-2 mt-8">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common:common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!formState.isValid || !formState.isDirty}
        >
          {t("common:common.save")}
        </Button>
      </div>
    </form>
  );
};

export default MetadataForm;
