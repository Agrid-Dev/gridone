import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import type { Trigger } from "@/api/automations";
import type { TriggerDescriptor } from "./types";

export const SchedulePresenter = ({ trigger }: { trigger: Trigger }) => {
  const { t } = useTranslation("automations");
  const cron = typeof trigger.cron === "string" ? trigger.cron : "";
  return (
    <dl className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <dt className="min-w-[7rem] text-xs uppercase tracking-wide text-muted-foreground">
          {t("triggers.cron")}
        </dt>
        <dd className="font-mono text-sm">{cron || "—"}</dd>
      </div>
    </dl>
  );
};

export const scheduleTriggerDescriptor: TriggerDescriptor = {
  icon: Clock,
  Presenter: SchedulePresenter,
};
