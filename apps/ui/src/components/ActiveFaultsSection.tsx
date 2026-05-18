import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { Device } from "@/api/devices";
import { FaultItem } from "./FaultItem";
import { getActiveFaults } from "@/lib/faults";

type ActiveFaultsSectionProps = {
  device: Device;
};

export function ActiveFaultsSection({ device }: ActiveFaultsSectionProps) {
  const { t } = useTranslation("devices");
  const faults = getActiveFaults(device);

  if (faults.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center gap-2 text-[hsl(var(--warning))]">
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        <h3 className="text-sm font-semibold">
          {t("deviceDetails.activeFaults.title")}
        </h3>
      </div>
      <div className="space-y-1.5">
        {faults.map((fault) => (
          <FaultItem key={fault.name} attribute={fault} />
        ))}
      </div>
    </div>
  );
}
