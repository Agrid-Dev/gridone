import { FC, FormEvent, useState } from "react";
import { Button } from "@/components/ui";
import CommandTemplatePicker from "@/components/forms/resourcePickers/CommandTemplatePicker";
import { useTranslation } from "react-i18next";
import { TitlePresenter } from "../presenters/BasePresenter";
import { Terminal } from "lucide-react";

interface ActionFormProps {
  initialValue?: string; // actionTemplateId
  onSubmit: (actionTemplateId: string) => void;
  onCancel: () => void;
  formId?: string;
  hideActions?: boolean;
}

const ActionForm: FC<ActionFormProps> = ({
  initialValue,
  onSubmit,
  onCancel,
  formId,
  hideActions,
}) => {
  const [actionTemplateId, setActionTemplateId] = useState<string | undefined>(
    initialValue,
  );
  const { t } = useTranslation(["common", "automations"]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (actionTemplateId) onSubmit(actionTemplateId);
  };

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <CommandTemplatePicker
        value={actionTemplateId}
        onSelect={(template) => setActionTemplateId(template.id)}
        label={
          <TitlePresenter
            title={t("automations:actions.pickTemplate")}
            icon={Terminal}
          />
        }
      />
      {!hideActions && (
        <div className="flex align-middle justify-end gap-2 mt-8">
          <Button
            type="button"
            onClick={() => {
              setActionTemplateId(initialValue);
              onCancel();
            }}
            variant="secondary"
          >
            {t("common:common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!actionTemplateId || actionTemplateId === initialValue}
          >
            {t("common:common.save")}
          </Button>
        </div>
      )}
    </form>
  );
};

export default ActionForm;
