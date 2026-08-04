import { ArrowRight, Play, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Action, Trigger } from "@gridone/sdk";
import { cn } from "@/lib/utils";
import { RuleChip } from "./RuleChip";
import { TriggerChip } from "./TriggerChip";
import { ActionChip } from "./ActionChip";

interface RuleSentenceProps {
  trigger?: Trigger | null;
  action?: Action | null;
  className?: string;
}

/** The automation read as a sentence: trigger chip → action chip. Missing
 *  sides render as dashed placeholders (wizard in-progress preview). */
export function RuleSentence({
  trigger,
  action,
  className,
}: RuleSentenceProps) {
  const { t } = useTranslation("automations");
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
      {action ? (
        <ActionChip action={action} />
      ) : (
        <RuleChip icon={Play} placeholder>
          {t("flow.action")}
        </RuleChip>
      )}
    </div>
  );
}
