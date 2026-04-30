import { FC } from "react";
import { TypographyH3 } from "@/components/ui/typography";
import { type Automation } from "@/api/automations";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/fallbacks/Error";
import TriggerForm from "./TriggerForm";
import { TriggerPresenter } from "../presenters/TriggerPresenter";
import { Card } from "@/components/ui";
import { useTranslation } from "react-i18next";

interface AutomationFormProps {
  initialValues?: Automation;
}

const AutomationForm: FC<AutomationFormProps> = ({ initialValues }) => {
  const { t } = useTranslation("automations");
  return (
    <>
      <Card className="p-4 mt-4">
        <TypographyH3>
          1.&nbsp;
          {t("flow.trigger")}
        </TypographyH3>
        <div className="mt-4">
          {initialValues ? (
            <TriggerPresenter trigger={initialValues.trigger} />
          ) : (
            <TriggerForm onSubmit={() => {}} onCancel={() => {}} />
          )}
        </div>
      </Card>
    </>
  );
};

const AutomationFormWrapper: FC<AutomationFormProps> = (props) => (
  <ErrorBoundary fallback={<ErrorFallback />}>
    <AutomationForm {...props} />
  </ErrorBoundary>
);

export default AutomationFormWrapper;
