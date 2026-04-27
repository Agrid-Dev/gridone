import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Trigger } from "@/api/automations";
import { SchedulePresenter } from "./SchedulePresenter";
import { ChangeEventPresenter } from "./ChangeEventPresenter";

const PROVIDER_PRESENTERS: Record<
  string,
  (props: { trigger: Trigger }) => ReactNode
> = {
  schedule: SchedulePresenter,
  change_event: ChangeEventPresenter,
};

export function TriggerPresenter({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation("automations");
  const Presenter = PROVIDER_PRESENTERS[trigger.type];
  if (!Presenter) {
    return (
      <p className="text-sm text-muted-foreground">
        {t(`triggers.${trigger.type}`, { defaultValue: trigger.type })}
      </p>
    );
  }
  return <Presenter trigger={trigger} />;
}
