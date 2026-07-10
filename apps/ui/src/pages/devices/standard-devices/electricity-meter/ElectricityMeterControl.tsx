import { useTranslation } from "react-i18next";
import { Zap } from "lucide-react";
import {
  isElectricityMeter,
  readElectricityMeterAttributes,
} from "@/lib/devices";
import { ControlPanel } from "../ControlPanel";
import type { StandardControlProps } from "../types";

function fmt(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(decimals);
}

export function ElectricityMeterControl({ device }: StandardControlProps) {
  const { t } = useTranslation("devices");

  if (!isElectricityMeter(device)) return null;
  const a = readElectricityMeterAttributes(device);

  return (
    <ControlPanel
      size="sm"
      modeChip={<Zap className="h-6 w-6 text-muted-foreground" />}
      headerLabel={
        <span className="text-xs text-muted-foreground">
          {t("controls.electricityMeter.title", {
            defaultValue: "Electricity meter",
          })}
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-3">
        <Metric
          label={t("controls.electricityMeter.activePower", {
            defaultValue: "Active power",
          })}
          value={fmt(a.activePower, 0)}
          unit="W"
        />
        <Metric
          label={t("controls.electricityMeter.reactivePower", {
            defaultValue: "Reactive power",
          })}
          value={fmt(a.reactivePower, 0)}
          unit="var"
        />
        <Metric
          label={t("controls.electricityMeter.energy", {
            defaultValue: "Energy",
          })}
          value={fmt(a.energy)}
          unit="kWh"
        />
        <Metric
          label={t("controls.electricityMeter.index", {
            defaultValue: "Index",
          })}
          value={fmt(a.index)}
        />
      </dl>
    </ControlPanel>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-2xl border border-transparent bg-primary/[0.04] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-medium tabular-nums">
        {value}
        {unit && (
          <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
        )}
      </dd>
    </div>
  );
}
