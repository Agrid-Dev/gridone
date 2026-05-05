import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "lucide-react";
import CommandTemplatePicker from "@/components/forms/resourcePickers/CommandTemplatePicker";
import { TitlePresenter } from "../../presenters/BasePresenter";
import type { CustomActionFormProps } from "../../presenters/types";

export const TemplatePickerForm: FC<CustomActionFormProps> = ({
  initialValue,
  onChange,
}) => {
  const { t } = useTranslation("automations");
  const value =
    initialValue?.kind === "templateId" ? initialValue.templateId : undefined;

  return (
    <CommandTemplatePicker
      value={value}
      onSelect={(template) =>
        onChange({ kind: "templateId", templateId: template.id })
      }
      label={
        <TitlePresenter title={t("actions.pickTemplate")} icon={Terminal} />
      }
    />
  );
};
