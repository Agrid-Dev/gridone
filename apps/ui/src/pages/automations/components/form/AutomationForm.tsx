import { FC } from "react";
import { TypographyH2 } from "@/components/ui/typography";
import { type Automation } from "@/api/automations";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/fallbacks/Error";
import TriggerForm from "./TriggerForm";

interface AutomationFormProps {
  initialValues?: Automation;
}

const AutomationForm: FC<AutomationFormProps> = () => {
  return (
    <>
      <TypographyH2>My great automation form</TypographyH2>
      <TriggerForm />
    </>
  );
};

const AutomationFormWrapper: FC<AutomationFormProps> = (props) => (
  <ErrorBoundary fallback={<ErrorFallback />}>
    <AutomationForm {...props} />
  </ErrorBoundary>
);

export default AutomationFormWrapper;
