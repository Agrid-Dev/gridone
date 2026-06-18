import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import type { Device } from "@/api/devices";
import { InputController } from "@/components/forms/controllers/InputController";
import {
  Section,
  SectionRow,
  SectionEditButton,
  SectionActions,
} from "./Section";

const identitySchema = z.object({ name: z.string().trim().min(1) });
type IdentityValues = z.infer<typeof identitySchema>;

interface IdentitySectionProps {
  device: Device;
  isEditing: boolean;
  canEdit: boolean;
  isSubmitting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (payload: Partial<Device>) => void;
}

export function IdentitySection({
  device,
  isEditing,
  canEdit,
  isSubmitting,
  onEdit,
  onCancel,
  onSave,
}: IdentitySectionProps) {
  const { t } = useTranslation("devices");
  const nameLabel = t("devices.fields.name");
  const form = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    mode: "onChange",
    defaultValues: { name: device.name },
  });

  return (
    <Section
      title={t("deviceDetails.config.identity.title")}
      busy={isSubmitting}
      action={
        canEdit ? (
          <SectionEditButton
            label={t("deviceDetails.config.identity.edit")}
            onClick={onEdit}
          />
        ) : undefined
      }
    >
      {isEditing ? (
        <form
          onSubmit={form.handleSubmit((values) =>
            onSave({ name: values.name }),
          )}
        >
          <SectionRow label={nameLabel}>
            <InputController
              name="name"
              control={form.control}
              inputProps={{ "aria-label": nameLabel }}
            />
          </SectionRow>
          <SectionActions
            saveDisabled={!form.formState.isValid || !form.formState.isDirty}
            submitting={isSubmitting}
            onCancel={onCancel}
          />
        </form>
      ) : (
        <SectionRow label={nameLabel}>{device.name || device.id}</SectionRow>
      )}
    </Section>
  );
}
