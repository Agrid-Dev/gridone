import { ArrowRight, Play, Split, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AutomationBranch, Trigger } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { countCases, isDecisionTree } from "../AutomationPage/tree/model";
import { RuleChip } from "./RuleChip";
import { TriggerChip } from "./TriggerChip";
import { ActionChip } from "./ActionChip";

interface RuleSentenceProps {
  trigger?: Trigger | null;
  className?: string;
  branches?: AutomationBranch[];
}

/** The automation read as a sentence: trigger chip → action chip, or the
 *  case count when the tree holds a decision. Missing sides render as dashed
 *  placeholders (wizard in-progress preview). */
export function RuleSentence({
  trigger,
  className,
  branches,
}: RuleSentenceProps) {
  const { t } = useTranslation("automations");
  const action =
    branches && !isDecisionTree(branches)
      ? (branches[0]?.action ?? null)
      : null;
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      {trigger ? (
        <TriggerChip trigger={trigger} />
      ) : (
        <RuleChip icon={Zap} placeholder>
          {t("flow.trigger")}
        </RuleChip>
      )}
      <ArrowRight
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
      />
      {branches && isDecisionTree(branches) ? (
        <RuleChip icon={Split}>
          {t("tree.caseCount", { count: countCases(branches) })}
        </RuleChip>
      ) : action ? (
        <ActionChip action={action} />
      ) : (
        <RuleChip icon={Play} placeholder>
          {t("flow.action")}
        </RuleChip>
      )}
    </div>
  );
}
