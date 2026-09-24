import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Check,
  CircleDashed,
  CircleQuestionMark,
  History,
  PencilLine,
  Plus,
  ShieldCheck,
  Split,
  SquareTerminal,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Action, AutomationExecution, Trigger } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { formatValue, type CellValue } from "@/lib/formatValue";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useBuildingTimezone } from "@/hooks/useBuildingProfile";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { SeverityChip } from "@/components/SeverityChip";
import { SEVERITIES, type Severity } from "@/lib/severity";
import { ConditionPhrase } from "@/pages/devices/device/operating-rules/RuleSentence";
import { getTriggerDescriptor } from "../presenters/triggerRegistry";
import {
  actionKind,
  actionTypeKey,
  inlineWriteOf,
  isInlineWrite,
  type ActionKind,
} from "../presenters/commandShape";
import { isCondition } from "../presenters/ChangeEventPresenter";
import { describeCronExpression } from "../presenters/cronDescription";
import {
  caseResult,
  otherwiseTaken,
  type CaseResult,
  type CaseView,
  type DecisionView,
  type OutcomeView,
} from "./model";
import { sameSelection, useTree, type Selection } from "./TreeContext";

// ------------------------------------------------------------ primitives

const cardBase =
  "relative flex flex-col gap-1.5 rounded-xl border bg-card p-3 text-left text-sm shadow-sm " +
  "transition-[border-color,box-shadow] hover:border-primary/40 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function NodeCard({
  selection,
  className,
  dashed,
  dim,
  children,
}: {
  selection: Selection;
  className?: string;
  dashed?: boolean;
  dim?: boolean;
  children: ReactNode;
}) {
  const { selection: current, select } = useTree();
  const selected = sameSelection(current, selection);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        select(selection);
      }}
      className={cn(
        cardBase,
        dashed && "border-dashed shadow-none",
        className,
        selected &&
          "border-primary ring-4 ring-primary/15 hover:border-primary",
        dim && "opacity-45",
      )}
    >
      {children}
    </button>
  );
}

const TONES = {
  trigger: "bg-primary text-primary-foreground",
  decision: "bg-node-decision/10 text-node-decision",
  command: "bg-node-command/10 text-node-command",
  write: "bg-node-write/10 text-node-write",
  notify: "bg-node-notify/10 text-node-notify",
  pick: "bg-primary/10 text-primary",
} as const;

function Tile({
  icon: Icon,
  tone,
  large,
}: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md",
        large ? "size-8 rounded-lg" : "size-6",
        TONES[tone],
      )}
    >
      <Icon className={large ? "size-4" : "size-3.5"} />
    </span>
  );
}

function Caps({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[11px] font-bold uppercase leading-4 tracking-[0.07em]",
        className,
      )}
    >
      {children}
    </span>
  );
}

const CHIP_TONES = {
  ok: "border-status-ok/30 bg-status-ok/10 text-green-700 dark:text-status-ok",
  neutral: "border-border bg-muted text-muted-foreground",
  warning:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  quiet: "border-border bg-card text-muted-foreground",
} as const;

export function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: keyof typeof CHIP_TONES;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11.5px] font-semibold",
        CHIP_TONES[tone],
      )}
    >
      {Icon && <Icon aria-hidden className="size-3" strokeWidth={2.5} />}
      {children}
    </span>
  );
}

const RESULT_CHIPS: Record<
  CaseResult | "taken",
  { tone: keyof typeof CHIP_TONES; icon?: LucideIcon }
> = {
  matched: { tone: "ok", icon: Check },
  taken: { tone: "ok", icon: Check },
  not_matched: { tone: "neutral", icon: X },
  unknown: { tone: "warning", icon: CircleQuestionMark },
  skipped: { tone: "quiet" },
};

export function ResultChip({ result }: { result: CaseResult | "taken" }) {
  const { t } = useTranslation("automations");
  const { tone, icon } = RESULT_CHIPS[result];
  return (
    <Chip tone={tone} icon={icon}>
      {t(`tree.results.${result}`)}
    </Chip>
  );
}

/** How an execution ended, as the server recorded it. */
export function RunChip({ execution }: { execution: AutomationExecution }) {
  const { t } = useTranslation("automations");
  const key =
    execution.reason === "write_rejected"
      ? "rejected"
      : execution.reason === "condition_unknown"
        ? "unknown"
        : execution.status;
  const tone =
    key === "success"
      ? "ok"
      : key === "failed"
        ? "error"
        : key === "rejected" || key === "unknown" || key === "tripped"
          ? "warning"
          : "neutral";
  const icon =
    key === "success"
      ? Check
      : key === "rejected"
        ? ShieldCheck
        : key === "failed"
          ? X
          : key === "unknown"
            ? CircleQuestionMark
            : undefined;
  return (
    <Chip tone={tone} icon={icon}>
      {t(`executions.outcome.${key}`, {
        defaultValue: t(`executions.status.${execution.status}`),
      })}
    </Chip>
  );
}

// -------------------------------------------------------------- trigger

export function TriggerNode() {
  const { t } = useTranslation("automations");
  const { trigger, replay } = useTree();
  if (!trigger)
    return (
      <NodeCard
        selection={{ kind: "trigger" }}
        dashed
        className="w-80 border-primary/60"
      >
        <span className="flex items-center gap-2">
          <Tile icon={Plus} tone="pick" />
          <Caps className="text-primary">{t("tree.when")}</Caps>
        </span>
        <span className="text-[15px] font-semibold text-primary">
          {t("tree.chooseTrigger")}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("tree.chooseTriggerHint")}
        </span>
      </NodeCard>
    );
  const Icon = getTriggerDescriptor(trigger.provider_id).icon;
  const context = replay?.execution.context;
  return (
    <NodeCard
      selection={{ kind: "trigger" }}
      className="w-80 border-primary/25 bg-accent"
    >
      <span className="flex items-center gap-2">
        <Tile icon={Icon} tone="trigger" />
        <Caps className="text-primary">{t("tree.when")}</Caps>
        <span className="truncate text-xs text-muted-foreground">
          ·{" "}
          {t(`triggers.types.${trigger.provider_id}`, {
            defaultValue: trigger.provider_id,
          })}
        </span>
      </span>
      <span className="text-[15px] font-semibold leading-snug text-foreground">
        <TriggerTitle trigger={trigger} />
      </span>
      {context?.device_id && (
        <span className="flex">
          <Chip tone="quiet" icon={History}>
            {context.has_previous
              ? `${formatValue(context.previous_value as CellValue)} → ${formatValue(context.value as CellValue)}`
              : formatValue(context.value as CellValue)}
          </Chip>
        </span>
      )}
    </NodeCard>
  );
}

/** The trigger as a business event: "Mode of TMK_mqtt_3 = heat", "Every day at 07:00". */
export function TriggerTitle({ trigger }: { trigger: Trigger }) {
  const { t, i18n } = useTranslation("automations");
  const { catalog } = useTree();
  const attributeLabel = useAttributeLabel();
  const timezone = useBuildingTimezone();
  const params = trigger.params ?? {};
  if (trigger.provider_id === "schedule") {
    const cron = typeof params.cron === "string" ? params.cron : "";
    const description = describeCronExpression(
      cron,
      i18n?.resolvedLanguage ?? i18n?.language,
    );
    return (
      <>
        {description ?? t("triggers.schedule.descriptionUnavailable")}
        {timezone && (
          <>
            {" "}
            <span className="font-normal text-muted-foreground">
              ({timezone})
            </span>
          </>
        )}
      </>
    );
  }
  if (trigger.provider_id === "change_event") {
    const deviceId =
      typeof params.device_id === "string" ? params.device_id : "";
    const attribute =
      typeof params.attribute === "string" ? params.attribute : "";
    const device = catalog.devices.find((item) => item.id === deviceId);
    const values = {
      device: device?.name ?? (deviceId || "—"),
      attribute:
        attributeLabel(attribute, device?.attributes?.[attribute]) || "—",
    };
    const condition = isCondition(params.condition) ? params.condition : null;
    return condition ? (
      <>
        {t("tree.triggerChange", {
          ...values,
          operator: t(`operators.${condition.operator}`, {
            defaultValue: condition.operator,
          }),
          value: formatValue(condition.threshold),
        })}
      </>
    ) : (
      <>{t("tree.triggerChangeAny", values)}</>
    );
  }
  return <>{trigger.provider_id}</>;
}

// ------------------------------------------------------------- decision

export function DecisionNode({ view }: { view: DecisionView }) {
  const { t } = useTranslation("automations");
  const { replay } = useTree();
  const reached =
    !replay ||
    view.cases.some((item) => replay.results.has(item.branch.id)) ||
    (view.otherwise.branch !== null &&
      replay.results.has(view.otherwise.branch.id));
  return (
    <NodeCard
      selection={{ kind: "decision", levelId: view.levelId }}
      dim={!reached}
      className="min-w-64 flex-row items-center gap-2.5 rounded-2xl border-node-decision/30 py-2 pr-4"
    >
      <Tile icon={Split} tone="decision" large />
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold leading-5">{t("tree.decision")}</span>
        <span className="whitespace-nowrap text-xs leading-4 text-muted-foreground">
          {t("tree.decisionRule")}
        </span>
      </span>
    </NodeCard>
  );
}

export function CaseNode({ item }: { item: CaseView }) {
  const { t } = useTranslation("automations");
  const { replay, incompleteConditions, catalog } = useTree();
  const id = item.branch.id;
  const result = replay ? caseResult(replay, id) : null;
  const incomplete = incompleteConditions.has(id);
  const condition = item.branch.condition;
  return (
    <NodeCard
      selection={{ kind: "case", branchId: id }}
      dashed={incomplete || item.unreachable}
      dim={result === "skipped"}
      className={cn(
        "w-56 border-node-decision/25 bg-node-decision/[0.03]",
        incomplete && "border-amber-500",
        item.unreachable && "border-muted-foreground/40",
      )}
    >
      <span className="flex min-h-5 items-center justify-between gap-2">
        <Caps className={incomplete ? "text-amber-700" : "text-node-decision"}>
          {t(item.label === "if" ? "tree.if" : "tree.elseIf")}
        </Caps>
        {result ? (
          <ResultChip result={result} />
        ) : item.unreachable ? (
          <Chip tone="warning" icon={TriangleAlert}>
            {t("tree.unreachable")}
          </Chip>
        ) : null}
      </span>
      {item.branch.name && (
        <span className="font-semibold leading-5 text-foreground">
          {item.branch.name}
        </span>
      )}
      <span
        className={cn(
          "leading-relaxed",
          item.branch.name ? "text-[13px] text-muted-foreground" : "text-sm",
        )}
      >
        {item.alwaysTrue || condition == null ? (
          <span className="font-medium text-amber-700">
            {t("tree.alwaysTrue")}
          </span>
        ) : incomplete ? (
          <span className="font-medium text-amber-700">
            {t("tree.chooseCondition")}
          </span>
        ) : (
          <ConditionPhrase value={condition} catalog={catalog} />
        )}
      </span>
    </NodeCard>
  );
}

export function OtherwiseNode({ view }: { view: DecisionView }) {
  const { t } = useTranslation("automations");
  const { replay } = useTree();
  const taken = replay ? otherwiseTaken(replay, view) : null;
  return (
    <NodeCard
      selection={{ kind: "otherwise", levelId: view.levelId }}
      dashed
      dim={taken === false}
      className="w-56 border-node-decision/35"
    >
      <span className="flex min-h-5 items-center justify-between gap-2">
        <Caps className="text-node-decision">{t("tree.otherwise")}</Caps>
        {taken !== null && <ResultChip result={taken ? "taken" : "skipped"} />}
      </span>
      <span className="text-sm text-muted-foreground">
        {t("tree.otherwiseRule")}
      </span>
    </NodeCard>
  );
}

// --------------------------------------------------------------- outcomes

const ACTION_LOOK: Record<
  ActionKind,
  { icon: LucideIcon; tone: keyof typeof TONES }
> = {
  command: { icon: SquareTerminal, tone: "command" },
  write: { icon: PencilLine, tone: "write" },
  notify: { icon: Bell, tone: "notify" },
};

const TONE_TEXT = {
  command: "text-node-command",
  write: "text-node-write",
  notify: "text-node-notify",
} as const;

export function ActionNode({
  outcome,
}: {
  outcome: Extract<OutcomeView, { kind: "action" }>;
}) {
  const { t } = useTranslation("automations");
  const { replay, incompleteActions } = useTree();
  const { action, branch } = outcome;
  const look = ACTION_LOOK[actionKind(action)];
  const executed = replay?.execution.branch_id === branch.id;
  const incomplete = incompleteActions.has(branch.id);
  return (
    <NodeCard
      selection={{ kind: "action", branchId: branch.id }}
      dashed={incomplete}
      dim={Boolean(replay) && !executed}
      className={cn("w-56", incomplete && "border-amber-500")}
    >
      <span className="mb-0.5 flex items-center gap-2">
        <Tile icon={look.icon} tone={look.tone} />
        <span
          className={cn(
            "truncate text-[12.5px] font-semibold",
            TONE_TEXT[look.tone as keyof typeof TONE_TEXT],
          )}
        >
          {t(actionTypeKey(action), { defaultValue: action.provider_id })}
        </span>
      </span>
      <ActionSummary action={action} />
      {incomplete && (
        <span className="text-xs font-medium text-amber-700">
          {t("tree.actionIncomplete")}
        </span>
      )}
      {executed && replay && (
        <span className="flex">
          <RunChip execution={replay.execution} />
        </span>
      )}
    </NodeCard>
  );
}

/** What an action does, in the card's two lines: title, then target. */
export function ActionSummary({ action }: { action: Action }) {
  const params = action.params ?? {};
  if (action.provider_id === "command_template")
    return isInlineWrite(action) ? (
      <WriteTitle action={action} />
    ) : (
      <CommandTemplateTitle
        templateId={
          typeof params.template_id === "string" ? params.template_id : ""
        }
      />
    );
  if (action.provider_id === "notification")
    return <NotificationTitle params={params} />;
  return <span className="font-semibold">{action.provider_id}</span>;
}

function CommandTemplateTitle({ templateId }: { templateId: string }) {
  const { t } = useTranslation("automations");
  const client = useGridoneClient();
  const { data: template } = useQuery({
    queryKey: ["command-templates", templateId],
    queryFn: () => client.devices.commandTemplates.get(templateId),
    enabled: !!templateId,
  });
  return (
    <>
      <span className="font-semibold leading-5 text-foreground">
        {template?.name || t("tree.commandTemplate")}
      </span>
      <span className="text-[13px] leading-5 text-muted-foreground">
        {t("fields.actionTemplate")}
      </span>
    </>
  );
}

function WriteTitle({ action }: { action: Action }) {
  const { t } = useTranslation("automations");
  const { catalog, trigger } = useTree();
  const attributeLabel = useAttributeLabel();
  const write = inlineWriteOf(action);
  const deviceId =
    write?.device_id ??
    (typeof trigger?.params?.device_id === "string"
      ? trigger.params.device_id
      : "");
  const device = catalog.devices.find((item) => item.id === deviceId);
  const attribute = write?.attribute ?? "";
  return (
    <>
      <span className="font-semibold leading-5 text-foreground">
        {attributeLabel(attribute, device?.attributes?.[attribute]) || "—"} →{" "}
        {write ? formatValue(write.value) : "—"}
      </span>
      <span className="text-[13px] leading-5 text-muted-foreground">
        {write?.device_id
          ? (device?.name ?? write.device_id)
          : t("tree.onEventDevice")}
      </span>
    </>
  );
}

function NotificationTitle({ params }: { params: Record<string, unknown> }) {
  const { t } = useTranslation("automations");
  const recipients = Array.isArray(params.user_ids)
    ? params.user_ids.length
    : 0;
  const severity: Severity = SEVERITIES.includes(params.severity as Severity)
    ? (params.severity as Severity)
    : "info";
  return (
    <>
      <span className="font-semibold leading-5 text-foreground">
        {typeof params.title === "string" && params.title ? params.title : "—"}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
        {t("tree.recipients", { count: recipients })}
        <SeverityChip severity={severity} />
      </span>
    </>
  );
}

export function NothingNode({ view }: { view: DecisionView }) {
  const { t } = useTranslation("automations");
  const { replay } = useTree();
  const taken = replay ? otherwiseTaken(replay, view) : null;
  return (
    <NodeCard
      selection={{ kind: "otherwise", levelId: view.levelId }}
      dashed
      dim={taken === false}
      className="w-56 bg-card/70"
    >
      <span className="flex items-center gap-2 font-semibold text-foreground">
        <CircleDashed aria-hidden className="size-4 text-muted-foreground" />
        {t("tree.nothing")}
      </span>
      <span className="pl-6 text-xs text-muted-foreground">
        {t("tree.nothingHint")}
      </span>
      {taken && replay && (
        <span className="flex pl-6">
          <RunChip execution={replay.execution} />
        </span>
      )}
    </NodeCard>
  );
}

export function PickNode({
  outcome,
}: {
  outcome: Extract<OutcomeView, { kind: "empty" }>;
}) {
  const { t } = useTranslation("automations");
  return (
    <NodeCard
      selection={{ kind: "empty", branchId: outcome.branchId }}
      dashed
      className="w-56 border-primary/60"
    >
      <span className="flex items-center gap-2 font-semibold text-primary">
        <Tile icon={Plus} tone="pick" />
        {t("tree.chooseAction")}
      </span>
      <span className="pl-8 text-xs text-muted-foreground">
        {t("tree.chooseActionHint")}
      </span>
    </NodeCard>
  );
}
