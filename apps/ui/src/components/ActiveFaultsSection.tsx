import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
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

/** Rule colour per status level (literal classes so Tailwind keeps them). */
const RULE_CLASSES: Record<StatusLevel, string> = {
  ok: "border-status-ok",
  info: "border-status-info",
  warning: "border-status-warning",
  error: "border-status-error",
};

type ActiveFaultsSectionProps = {
  device: Device;
};

/** Collapsed-by-default fault line, tinted by the highest active severity and
 *  expandable to the full list.
 *
 *  It is a rule and a sentence rather than a filled panel: the count is
 *  already in the device's title chip, and as a full-width panel this repeat
 *  outweighed every control on the page — including the one that decides where
 *  a command is sent. Severity keeps its colour; it loses its surface. */
export function ActiveFaultsSection({ device }: ActiveFaultsSectionProps) {
  const { t } = useTranslation("devices");
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const targeted = location.hash === "#active-faults";
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!targeted) return;
    setExpanded(true);
    section.current?.scrollIntoView?.({ block: "start" });
    section.current?.focus({ preventScroll: true });
  }, [targeted, location.key]);
  const faults = getActiveFaults(device);

  if (faults.length === 0)
    return targeted ? (
      <div
        id="active-faults"
        ref={section}
        tabIndex={-1}
        className="scroll-mt-20 text-sm text-muted-foreground"
      >
        {t("deviceDetails.activeFaults.empty")}
      </div>
    ) : null;

  // getActiveFaults sorts most-severe first, so [0] is the highest severity.
  const severity = faults[0].severity;
  const level = SEVERITY_LEVEL[severity];

  return (
    <div
      id="active-faults"
      ref={section}
      tabIndex={-1}
      data-severity={severity}
      className="-my-1 scroll-mt-20"
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 border-l-[3px] pl-3",
          RULE_CLASSES[level],
        )}
      >
        <span
          className={cn("flex items-center gap-2", SEMANTIC_TEXT_CLASS[level])}
        >
          <FaultSeverityIcon severity={severity} />
          <span className="text-sm font-semibold">
            {t("deviceDetails.activeFaults.badge", { count: faults.length })}
          </span>
        </span>
        <span aria-hidden className="text-muted-foreground/40">
          ·
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {t(
            expanded
              ? "deviceDetails.activeFaults.collapse"
              : "deviceDetails.activeFaults.expand",
          )}
        </Button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-1.5 pl-3">
          {faults.map((fault) => (
            <FaultItem key={fault.name} attribute={fault} />
          ))}
        </div>
      )}
    </div>
  );
}
