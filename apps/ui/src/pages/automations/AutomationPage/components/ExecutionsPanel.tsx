import { ArrowRight, History } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { AutomationExecution } from "@gridone/sdk";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SEMANTIC_BG_CLASS } from "@/lib/semanticColors";
import { cn } from "@/lib/utils";
import { formatExecutionMoment } from "../../components/executionsSummary";

interface ExecutionsPanelProps {
  executions: AutomationExecution[];
  isLoading: boolean;
}

/** The automation's own run log: one line per execution, newest first. Errors
 *  and the produced command batch stay on the line so nothing the old history
 *  table showed is lost. */
export function ExecutionsPanel({
  executions,
  isLoading,
}: ExecutionsPanelProps) {
  const { t, i18n } = useTranslation("automations");
  const language = i18n?.resolvedLanguage ?? i18n?.language;

  return (
    <Card className="rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <History aria-hidden className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-display text-lg font-semibold tracking-tight">
          {t("recentExecutions.title")}
        </h2>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-5 w-full" />
          ))}
        </div>
      ) : executions.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("executions.empty")}
        </p>
      ) : (
        <ul
          aria-label={t("executions.title")}
          className="max-h-96 divide-y divide-border/60 overflow-y-auto"
        >
          {executions.map((execution) => (
            <li key={execution.id}>
              <ExecutionRow
                execution={execution}
                label={t(`executions.status.${execution.status}`)}
                moment={formatExecutionMoment(execution, language, t)}
                batchLabel={t("executions.viewBatch")}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One run: status dot, outcome, time — and, when the run produced a command
 *  batch, the whole row links to it rather than adding a second line. */
function ExecutionRow({
  execution,
  label,
  moment,
  batchLabel,
}: {
  execution: AutomationExecution;
  label: string;
  moment: string;
  batchLabel: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            execution.status === "success"
              ? SEMANTIC_BG_CLASS.ok
              : SEMANTIC_BG_CLASS.error,
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
        {execution.output_id && (
          <ArrowRight
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {moment}
        </span>
      </div>
      {execution.error && (
        <p className="mt-1 pl-[1.125rem] text-xs text-destructive/90">
          {execution.error}
        </p>
      )}
    </>
  );

  if (!execution.output_id) return <div className="py-3">{body}</div>;

  return (
    <Link
      to={`/devices/commands?batch_id=${encodeURIComponent(execution.output_id)}`}
      aria-label={`${label} — ${batchLabel}`}
      className="group -mx-2 block rounded-lg px-2 py-3 transition-colors hover:bg-muted/50"
    >
      {body}
    </Link>
  );
}
