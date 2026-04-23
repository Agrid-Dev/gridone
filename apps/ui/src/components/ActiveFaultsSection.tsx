import { useTranslation } from "react-i18next";
import type { Device } from "@/api/devices";
import { FaultItem } from "./FaultItem";
import { getActiveFaults } from "@/lib/faults";

type ActiveFaultsSectionProps = {
  device: Device;
};

export function ActiveFaultsSection({ device }: ActiveFaultsSectionProps) {
  const { t } = useTranslation("devices");
  const faults = getActiveFaults(device);

  return (
    <div className="space-y-3">
      <h3 className="font-display text-lg font-semibold text-foreground">
        {t("deviceDetails.activeFaults.title")}
      </h3>
      {faults.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("deviceDetails.activeFaults.empty")}
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
