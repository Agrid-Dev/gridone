import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, CircleQuestionMark, X } from "lucide-react";
import type { AutomationBranch, AutomationExecution } from "@gridone/sdk";
import { ResourceLink as Link } from "@/components/ResourceLink";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatValue, type CellValue } from "@/lib/formatValue";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { formatExecutionMoment } from "../../components/executionsSummary";
import { caseAt, findBranch, levelOf, otherwiseIndex } from "../tree/model";
import { RunChip } from "../tree/nodes";
import { useTree } from "../tree/TreeContext";

/**
 * How a branch is named in the history: its own name, else its place — or
 * null for the lone path of a level without condition, which the tree draws
 * as a plain link rather than a case.
 */
function useBranchLabel(branches: AutomationBranch[]) {
  const { t } = useTranslation("automations");
  return (branchId: string): string | null => {
    const location = findBranch(branches, branchId);
    if (!location) return t("panel.executions.removedCase");
    const level = levelOf(branches, location.levelId);
    if (otherwiseIndex(level) === location.index) return t("tree.otherwise");
    if (
      location.branch.condition == null &&
      !level.some((branch) => branch.condition != null)
    )
      return null;
    if (location.branch.name) return location.branch.name;
    const found = caseAt(branches, branchId);
    return t("panel.case.untitled", {
      position: (found?.index ?? location.index) + 1,
    });
  };
}

/** "Empty room › Cold outside → Write an attribute", from the server's record. */
function PathSummary({
  execution,
  branches,
}: {
  execution: AutomationExecution;
  branches: AutomationBranch[];
}) {
  const { t } = useTranslation("automations");
  const label = useBranchLabel(branches);
  const matched = (execution.branches ?? [])
    .filter((evaluation) => evaluation.result === "matched")
    .flatMap((evaluation) => label(evaluation.branch_id) ?? []);
  const unknown = (execution.branches ?? []).find(
    (evaluation) => evaluation.result === "unknown",
  );
  const final = execution.branch_id
    ? findBranch(branches, execution.branch_id)?.branch.action
    : null;
  const end = unknown
    ? t("panel.executions.stoppedAt", { name: label(unknown.branch_id) ?? "" })
    : final
      ? t(`actions.types.${final.provider_id}`, {
          defaultValue: final.provider_id,
        })
      : execution.status === "no_match"
        ? t("tree.nothing")
        : execution.reason
          ? t(`reasons.${execution.reason}`, { defaultValue: execution.reason })
          : "";
  return (
    <>
      {matched.join(" › ")}
      {matched.length > 0 && end && " → "}
      {end}
    </>
  );
}

export function ExecutionsTab({
  executions,
  isLoading,
  replayId,
  onReplay,
  branches,
}: {
  executions: AutomationExecution[];
  isLoading: boolean;
  replayId: string | null;
  onReplay: (id: string | null) => void;
  branches: AutomationBranch[];
}) {
  const { t, i18n } = useTranslation("automations");
  const language = i18n?.resolvedLanguage ?? i18n?.language;
  const selected = executions.find((execution) => execution.id === replayId);
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-muted-foreground">
        {t("panel.executions.help")}
      </p>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : executions.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {t("executions.empty")}
        </p>
      ) : (
        <ol
          aria-label={t("executions.title")}
          className="m-0 max-h-[26rem] list-none space-y-2 overflow-y-auto p-0"
        >
          {executions.map((execution) => {
            const active = execution.id === replayId;
            return (
              <li key={execution.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onReplay(active ? null : execution.id)}
                  className={cn(
                    "flex w-full flex-col gap-1 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active && "border-primary ring-2 ring-primary/15",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold tabular-nums">
                      {formatExecutionMoment(execution, language, t)}
                    </span>
                    <RunChip execution={execution} />
                  </span>
                  <span className="text-xs leading-5 text-muted-foreground">
                    <PathSummary execution={execution} branches={branches} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {selected && <ExecutionDetail execution={selected} branches={branches} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 text-sm leading-5">{children}</dd>
    </div>
  );
}

function ExecutionDetail({
  execution,
  branches,
}: {
  execution: AutomationExecution;
  branches: AutomationBranch[];
}) {
  const { t } = useTranslation("automations");
  const { catalog } = useTree();
  const attributeLabel = useAttributeLabel();
  const label = useBranchLabel(branches);
  const context = execution.context;
  const device = catalog.devices.find((item) => item.id === context?.device_id);
  const attribute = context?.attribute ?? "";
  return (
    <section
      aria-label={t("panel.executions.detail")}
      className="space-y-3 rounded-xl border bg-muted/30 p-4"
    >
      <dl className="m-0 space-y-3">
        {context?.device_id && (
          <Row label={t("panel.executions.event")}>
            {device?.name ?? context.device_id} ·{" "}
            {attributeLabel(attribute, device?.attributes?.[attribute])} :{" "}
            <strong>
              {context.has_previous
                ? `${formatValue(context.previous_value as CellValue)} → `
                : ""}
              {formatValue(context.value as CellValue)}
            </strong>
          </Row>
        )}
        {!!execution.branches?.length && (
          <Row label={t("panel.executions.path")}>
            <ol className="m-0 list-none space-y-1 p-0">
              {execution.branches
                .filter((evaluation) => label(evaluation.branch_id) !== null)
                .map((evaluation) => (
                  <li
                    key={evaluation.branch_id}
                    className="flex items-start gap-1.5"
                    style={{
                      paddingLeft: `${Math.max(0, (evaluation.path?.length ?? 1) - 1) * 1.1}rem`,
                    }}
                  >
                    {evaluation.result === "matched" ? (
                      <Check
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0 text-green-700"
                      />
                    ) : evaluation.result === "unknown" ? (
                      <CircleQuestionMark
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0 text-amber-700"
                      />
                    ) : (
                      <X
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      />
                    )}
                    <span>
                      <strong>{label(evaluation.branch_id)}</strong> —{" "}
                      {t(`tree.results.${evaluation.result}`).toLowerCase()}
                      {!!evaluation.missing?.length && (
                        <span className="block text-xs text-amber-700">
                          {t("panel.executions.missing", {
                            refs: evaluation.missing.join(", "),
                          })}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
            </ol>
          </Row>
        )}
        <Row label={t("panel.executions.result")}>
          <span className="flex flex-col gap-1">
            <span>
              {execution.reason
                ? t(`reasons.${execution.reason}`, {
                    defaultValue: execution.reason,
                  })
                : t(`executions.status.${execution.status}`)}
            </span>
            {execution.error && (
              <span className="text-destructive">{execution.error}</span>
            )}
            {execution.output_id && (
              <Link
                to={`/devices/commands?batch_id=${encodeURIComponent(execution.output_id)}`}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                {t("executions.viewBatch")}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            )}
          </span>
        </Row>
      </dl>
    </section>
  );
}
