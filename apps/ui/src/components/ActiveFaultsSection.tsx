import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Device } from "@gridone/sdk";
import { Button } from "@/components/ui";
import { FaultItem } from "./FaultItem";
import { FaultSeverityIcon } from "./FaultSeverityIcon";
import { getActiveFaults } from "@/lib/faults";
import {
  SEMANTIC_TEXT_CLASS,
  SEVERITY_LEVEL,
  type StatusLevel,
} from "@/lib/semanticColors";
import { cn } from "@/lib/utils";

/** Panel tint per status level (literal classes so Tailwind keeps them). */
const PANEL_CLASSES: Record<StatusLevel, string> = {
  ok: "border-status-ok/30 bg-status-ok/10",
  info: "border-status-info/30 bg-status-info/10",
  warning: "border-status-warning/30 bg-status-warning/10",
  error: "border-status-error/30 bg-status-error/10",
};

type ActiveFaultsSectionProps = {
  device: Device;
};

/** Collapsed-by-default banner showing the active-fault count, tinted by the
 *  highest active severity, expandable to the full fault list — so many
 *  simultaneous faults don't push the main device content off-screen. */
export function ActiveFaultsSection({ device }: ActiveFaultsSectionProps) {
  const { t } = useTranslation("devices");
  const [expanded, setExpanded] = useState(false);
  const faults = getActiveFaults(device);

  if (faults.length === 0) return null;

  // getActiveFaults sorts most-severe first, so [0] is the highest severity.
  const severity = faults[0].severity;
  const level = SEVERITY_LEVEL[severity];

  return (
    <div
      data-severity={severity}
      className={cn("rounded-xl border p-4", PANEL_CLASSES[level])}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={cn("flex items-center gap-2", SEMANTIC_TEXT_CLASS[level])}
        >
          <FaultSeverityIcon severity={severity} />
          <h3 className="text-sm font-semibold">
            {t("deviceDetails.activeFaults.badge", { count: faults.length })}
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {t(
            expanded
              ? "deviceDetails.activeFaults.collapse"
              : "deviceDetails.activeFaults.expand",
          )}
          {expanded ? (
            <ChevronUp className="ml-1 h-4 w-4" />
          ) : (
            <ChevronDown className="ml-1 h-4 w-4" />
          )}
        </Button>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1.5">
          {faults.map((fault) => (
            <FaultItem key={fault.name} attribute={fault} />
          ))}
        </div>
      )}
    </div>
  );
}
