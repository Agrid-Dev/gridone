import { History } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SEMANTIC_BG_CLASS } from "@/lib/semanticColors";
import { cn } from "@/lib/utils";
import { executionTime, type RecentExecution } from "./executionsSummary";

interface RecentExecutionsPanelProps {
  recent: RecentExecution[];
  isLoading: boolean;
}

/** Side panel merging the latest executions across all automations. */
export function RecentExecutionsPanel({
  recent,
  isLoading,
}: RecentExecutionsPanelProps) {
  const { t, i18n } = useTranslation("automations");
  const language = i18n?.resolvedLanguage ?? i18n?.language;

  return (
    <Card className="h-fit p-4">
      <div className="flex items-center gap-2">
        <History aria-hidden className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{t("recentExecutions.title")}</h3>
      </div>
      {isLoading ? (
        <div className="mt-3 space-y-2.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          {t("executions.empty")}
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border/60">
          {recent.map(({ execution, automationName }) => (
            <li key={execution.id} className="flex items-center gap-2.5 py-2.5">
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  execution.status === "success"
                    ? SEMANTIC_BG_CLASS.ok
                    : SEMANTIC_BG_CLASS.error,
                )}
              />
              <Link
                to={`/automations/${execution.automation_id}`}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {automationName}
              </Link>
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatExecutionMoment(execution, language, t)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** "16:20" today, "hier 23:00" yesterday, "3 août 23:00" beyond — the panel
 *  favors clock times (like a log) over relative wording. */
function formatExecutionMoment(
  execution: RecentExecution["execution"],
  language: string | undefined,
  t: TFunction<"automations">,
): string {
  const date = new Date(executionTime(execution));
  const time = date.toLocaleTimeString(language, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return t("recentExecutions.yesterdayAt", { time });
  }
  const day = date.toLocaleDateString(language, {
    day: "numeric",
    month: "short",
  });
  return `${day} ${time}`;
}
