import { Trigger } from "@/api/automations";

import { FC } from "react";
import { Card } from "@/components/ui";
import { useTriggerForm } from "./useTriggerForm";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorFallback } from "@/components/fallbacks/Error";

interface TriggerFormProps {
  initialValue?: Trigger;
}
const TriggerForm: FC<TriggerFormProps> = () => {
  const { triggerSchemas, isLoading } = useTriggerForm();
  if (isLoading) {
    return <Skeleton />;
  }
  if (!triggerSchemas) {
    return <ErrorFallback />;
  }
  return (
    <Card>
      {Object.keys(triggerSchemas).map((provider) => (
        <p key={provider}> {provider}</p>
      ))}
    </Card>
  );
};

export default TriggerForm;
