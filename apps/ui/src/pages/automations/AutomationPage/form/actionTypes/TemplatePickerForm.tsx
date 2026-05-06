import { FC, useState } from "react";
import CommandTemplatePicker from "@/components/forms/resourcePickers/CommandTemplatePicker";
import type { CustomActionFormProps } from "../../presenters/types";

function readInitialTemplateId(
  initialValue: CustomActionFormProps["initialValue"],
): string | undefined {
  if (initialValue?.providerId !== "command_template") return undefined;
  const id = initialValue.params.templateId;
  return typeof id === "string" ? id : undefined;
}

export const TemplatePickerForm: FC<CustomActionFormProps> = ({
  initialValue,
  onChange,
}) => {
  const [templateId, setTemplateId] = useState<string | undefined>(
    readInitialTemplateId(initialValue),
  );

  return (
    <CommandTemplatePicker
      value={templateId}
      onSelect={(template) => {
        setTemplateId(template.id);
        onChange({
          providerId: "command_template",
          params: { templateId: template.id },
        });
      }}
    />
  );
};
