import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import type { Trigger } from "@gridone/sdk";
import type { TriggerDescriptor } from "./types";
import { ScheduleForm } from "../form/ScheduleForm";
import { describeCronExpression } from "./cronDescription";

export const SchedulePresenter = ({ trigger }: { trigger: Trigger }) => {
  const { t, i18n } = useTranslation("automations");
  const cron =
    typeof trigger.params?.cron === "string" ? trigger.params.cron : "";
  const description = describeCronExpression(
    cron,
    i18n?.resolvedLanguage ?? i18n?.language,
  );

  return (
    <p className="text-sm font-medium">
      {description ?? t("triggers.schedule.descriptionUnavailable")}
    </p>
  );
};

export const scheduleTriggerDescriptor: TriggerDescriptor = {
  icon: Clock,
  Presenter: SchedulePresenter,
  CustomFormRenderer: ScheduleForm,
};
