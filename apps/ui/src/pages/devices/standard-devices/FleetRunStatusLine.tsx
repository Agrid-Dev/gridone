import { useTranslation } from "react-i18next";
import { attributeValueText } from "@/lib/attributeValueLabel";
import { lookupSemanticColor, SEMANTIC_BG_CLASS } from "@/lib/semanticColors";
import { cn } from "@/lib/utils";
import type { FleetRunStatus, RunState } from "./fleet-status";

/** The marker in front of the words: solid while running, hollow when
 *  stopped, dashed when not reported. A running mode that has a semantic
 *  colour paints the solid marker in it. Literal classes so Tailwind keeps
 *  them. */
const MARKER_CLASS: Record<RunState, string> = {
  running: "bg-foreground/70",
  stopped: "border-[1.5px] border-muted-foreground/70",
  unknown: "border-[1.5px] border-dashed border-muted-foreground/40",
};

/**
 * The status line of an HVAC unit's fleet card: the mode it runs in
 * ("Chauffage"), else its run state ("À l'arrêt"), behind a small marker.
 * The colour is the marker's alone — the words always say it, so colour is
 * never the only carrier of the state.
 */
export function FleetRunStatusLine({ status }: { status: FleetRunStatus }) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const mode = status.run === "running" ? status.mode : null;
  const color = mode ? lookupSemanticColor("mode", mode) : undefined;
  const label = mode
    ? attributeValueText("mode", mode, tCommon)
    : t(`devices.card.lead.runState.${status.run}`);

  return (
    <span
      data-run={status.run}
      className="inline-flex min-w-0 items-center gap-2 text-xs text-foreground/70"
    >
      <span
        aria-hidden
        className={cn(
          "size-[7px] shrink-0 rounded-[2px]",
          color ? SEMANTIC_BG_CLASS[color] : MARKER_CLASS[status.run],
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
