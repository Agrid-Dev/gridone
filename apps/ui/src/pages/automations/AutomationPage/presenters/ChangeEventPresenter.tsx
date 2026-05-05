import { type ReactNode } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TrendingUp } from "lucide-react";
import { getDevice } from "@/api/devices";
import { toLabel } from "@/lib/textFormat";
import { formatValue } from "@/lib/formatValue";
import type { Trigger } from "@/api/automations";
import type { TriggerDescriptor } from "./types";
import { ChangeEventForm } from "../form/ChangeEventForm";

type Condition = {
  operator: "gt" | "lt" | "gte" | "lte" | "eq" | "ne";
  threshold: string | number | boolean;
};

function isCondition(value: unknown): value is Condition {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.operator === "string" && "threshold" in v;
}

export const ChangeEventPresenter = ({ trigger }: { trigger: Trigger }) => {
  const { t } = useTranslation("automations");
  const params = trigger.params;
  const deviceId = typeof params.deviceId === "string" ? params.deviceId : "";
  const attribute =
    typeof params.attribute === "string" ? params.attribute : "";
  const condition = isCondition(params.condition) ? params.condition : null;

  const { data: device } = useQuery({
    queryKey: ["devices", deviceId],
    queryFn: () => getDevice(deviceId),
    enabled: !!deviceId,
  });

  return (
    <dl className="space-y-1">
      <Row label={t("triggers.device")}>
        {deviceId ? (
          <Link
            to={`/devices/${encodeURIComponent(deviceId)}`}
            className="hover:underline"
          >
            {device?.name ?? t("triggers.unknownDevice")}
          </Link>
        ) : (
          "—"
        )}
      </Row>
      <Row label={t("triggers.attribute")}>
        <span className="font-medium">{toLabel(attribute) || "—"}</span>
      </Row>
      <Row label={t("triggers.condition")}>
        {condition ? (
          <span className="font-mono text-sm">
            {t(`operators.${condition.operator}`, {
              defaultValue: condition.operator,
            })}{" "}
            {formatValue(condition.threshold)}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {t("triggers.noCondition")}
          </span>
        )}
      </Row>
    </dl>
  );
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <dt className="min-w-[7rem] text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="flex flex-wrap items-center gap-1.5 text-sm">
        {children}
      </dd>
    </div>
  );
}

export const changeEventTriggerDescriptor: TriggerDescriptor = {
  icon: TrendingUp,
  Presenter: ChangeEventPresenter,
  CustomFormRenderer: ChangeEventForm,
};
