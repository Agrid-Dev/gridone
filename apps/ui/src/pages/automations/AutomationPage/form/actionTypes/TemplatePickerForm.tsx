import { FC, useState } from "react";
import CommandTemplatePicker from "@/components/forms/resourcePickers/CommandTemplatePicker";
import type { CustomActionFormProps } from "../../presenters/types";

export const TemplatePickerForm: FC<CustomActionFormProps> = ({
  initialValue,
  onChange,
}) => {
  const [templateId, setTemplateId] = useState<string | undefined>(
    initialValue?.kind === "templateId" ? initialValue.templateId : undefined,
  );

  return (
    <CommandTemplatePicker
      value={templateId}
      onSelect={(template) => {
        setTemplateId(template.id);
        onChange({ kind: "templateId", templateId: template.id });
      }}
    />
  );
};
