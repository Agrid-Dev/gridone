import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Device } from "@/api/devices";
import { FaultItem } from "./FaultItem";
import { getAllFaultAttributes } from "@/lib/faults";

type FaultAttributesSectionProps = {
  device: Device;
};

export function FaultAttributesSection({
  device,
}: FaultAttributesSectionProps) {
  const { t } = useTranslation("devices");
  const faults = getAllFaultAttributes(device);
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="group flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {t("deviceDetails.faults.title")}
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
          {faults.length}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-2">
          {faults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("deviceDetails.faults.empty")}
            </p>
          ) : (
            faults.map((fault) => (
              <FaultItem key={fault.name} attribute={fault} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
