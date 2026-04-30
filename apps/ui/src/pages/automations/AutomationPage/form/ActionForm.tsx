import { FC, useState } from "react";
import { Button } from "@/components/ui";
import CommandTemplatePicker from "@/components/forms/resourcePickers/CommandTemplatePicker";
import { useTranslation } from "react-i18next";
import { TitlePresenter } from "../presenters/BasePresenter";
import { Terminal } from "lucide-react";

interface ActionFormProps {
  initialValue?: string; // actionTemplateId
  onSubmit: (actionTemplateId: string) => void;
  onCancel: () => void;
}

const ActionForm: FC<ActionFormProps> = ({
  initialValue,
  onSubmit,
  onCancel,
}) => {
  const [actionTemplateId, setActionTemplateId] = useState<string | undefined>(
    initialValue,
  );
  const { t } = useTranslation(["common", "automations"]);
  return (
    <div>
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
      <div className="flex align-middle justify-end gap-2 mt-8">
        {onCancel && (
          <Button
            onClick={() => {
              setActionTemplateId(initialValue);
              onCancel();
            }}
            variant="secondary"
          >
            {t("common:common.cancel")}
          </Button>
        )}
        <Button
          onClick={() => {
            if (actionTemplateId) onSubmit(actionTemplateId);
          }}
          disabled={!actionTemplateId || actionTemplateId === initialValue}
        >
          {t("common:common.save")}
        </Button>
      </div>
    </div>
  );
};

export default ActionForm;
