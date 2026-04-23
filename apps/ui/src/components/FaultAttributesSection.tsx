import { useTranslation } from "react-i18next";
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

  return (
    <div className="space-y-3">
      <h3 className="font-display text-lg font-semibold text-foreground">
        {t("deviceDetails.faults.title")}
      </h3>
      {faults.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("deviceDetails.faults.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {faults.map((fault) => (
            <FaultItem key={fault.name} attribute={fault} />
          ))}
        </div>
      )}
    </div>
  );
}
