import { useTranslation } from "react-i18next";
import { Fan, Wind, Droplets, ArrowRight, Thermometer } from "lucide-react";
import { isAwhp, readAwhpAttributes } from "@/api/devices";
import type { StandardControlProps } from "../types";

function fmt(v: number | null, unit = "°"): string {
  if (v == null) return "—";
  return `${Number(v).toFixed(1)}${unit}`;
}

function Reading({
  label,
  value,
  unit = "°",
  className = "",
}: {
  label: string;
  value: number | null;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-1 ${className}`}>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium tabular-nums">
        {fmt(value, unit)}
      </span>
    </div>
  );
}

export function AwhpControl({ device }: StandardControlProps) {
  const { t } = useTranslation("devices");

  if (!isAwhp(device)) return null;
  const a = readAwhpAttributes(device);

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border bg-card p-5 shadow-md">
      {/* ── Header: status + mode ── */}
      <div className="mb-4 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="font-medium uppercase">
            {t("controls.awhp.runStatus")}:{" "}
            <span className="text-foreground">{a.unitRunStatus ?? "—"}</span>
          </span>
        </div>
        {a.mode && (
          <span className="font-medium uppercase">
            {t("controls.awhp.mode")}:{" "}
            <span className="text-foreground">{a.mode}</span>
          </span>
        )}
      </div>

      {/* ── Outdoor temperature ── */}
      {a.outdoorTemperature != null && (
        <div className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{t("controls.awhp.outdoor")}</span>
          <span className="font-semibold tabular-nums text-foreground">
            {fmt(a.outdoorTemperature)}
          </span>
        </div>
      )}

      {/* ── Schematic ── */}
      <div className="flex flex-col items-center gap-0">
        {/* Row 1: Evaporator → Compressor → Condenser */}
        <div className="flex w-full items-center gap-0">
          {/* Evaporator */}
          <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <Wind className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {t("controls.awhp.evaporator")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {a.evaporatorSaturatedRefrigerantTemperature != null && (
                <Reading
                  label={t("controls.awhp.satTemp")}
                  value={a.evaporatorSaturatedRefrigerantTemperature}
                />
              )}
              {a.evaporatorRefrigerantPressure != null && (
                <Reading
                  label={t("controls.awhp.pressure")}
                  value={a.evaporatorRefrigerantPressure}
                  unit=" bar"
                />
              )}
            </div>
          </div>

          {/* Pipe: evap → compressor */}
          <div className="flex flex-col items-center px-1">
            <ArrowRight className="h-4 w-4 text-blue-400" />
            {a.compressorSuctionTemperature != null && (
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {fmt(a.compressorSuctionTemperature)}
              </span>
            )}
          </div>

          {/* Compressor */}
          <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-muted/80 p-3">
            <div className="flex items-center gap-1 text-foreground">
              <Fan className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {t("controls.awhp.compressor")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {a.compressorSuctionPressure != null && (
                <Reading
                  label={t("controls.awhp.suction")}
                  value={a.compressorSuctionPressure}
                  unit=" bar"
                />
              )}
              {a.compressorDischargePressure != null && (
                <Reading
                  label={t("controls.awhp.discharge")}
                  value={a.compressorDischargePressure}
                  unit=" bar"
                />
              )}
            </div>
          </div>

          {/* Pipe: compressor → condenser */}
          <div className="flex flex-col items-center px-1">
            <ArrowRight className="h-4 w-4 text-red-400" />
            {a.compressorDischargeTemperature != null && (
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {fmt(a.compressorDischargeTemperature)}
              </span>
            )}
          </div>

          {/* Condenser */}
          <div className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/30">
            <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <Droplets className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-wider">
                {t("controls.awhp.condenser")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              {a.condenserSaturatedRefrigerantTemperature != null && (
                <Reading
                  label={t("controls.awhp.satTemp")}
                  value={a.condenserSaturatedRefrigerantTemperature}
                />
              )}
              {a.condenserRefrigerantPressure != null && (
                <Reading
                  label={t("controls.awhp.pressure")}
                  value={a.condenserRefrigerantPressure}
                  unit=" bar"
                />
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Return path (expansion valve) */}
        <div className="flex w-full items-stretch">
          {/* Left vertical pipe */}
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-px border-l border-dashed border-blue-300 dark:border-blue-700" />
          </div>
          <div className="flex-shrink-0" style={{ width: "calc(100% / 3)" }} />
          {/* Right vertical pipe */}
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-px border-l border-dashed border-red-300 dark:border-red-700" />
          </div>
        </div>

        {/* Expansion valve */}
        <div className="rounded-lg border border-dashed border-border px-4 py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("controls.awhp.expansionValve")}
          </span>
        </div>

        {/* Bottom connecting line */}
        <div className="flex w-full items-stretch">
          <div className="flex flex-1 items-center justify-center">
            <div className="h-4 w-px border-l border-dashed border-blue-300 dark:border-blue-700" />
          </div>
          <div className="flex-shrink-0" style={{ width: "calc(100% / 3)" }} />
          <div className="flex flex-1 items-center justify-center">
            <div className="h-4 w-px border-l border-dashed border-red-300 dark:border-red-700" />
          </div>
        </div>
      </div>

      {/* ── Water side: inlet / outlet / setpoint ── */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 dark:border-sky-900 dark:bg-sky-950/30">
        <div className="flex items-center gap-1.5">
          <Droplets className="h-3.5 w-3.5 text-sky-500" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            {t("controls.awhp.waterSide")}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {t("controls.awhp.inlet")}
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {fmt(a.inletTemperature)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">
              {t("controls.awhp.outlet")}
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {fmt(a.outletTemperature)}
            </span>
          </div>

          {a.setpointTemperature != null && (
            <div className="flex items-center gap-1 border-l border-border pl-4">
              <span className="text-[10px] text-muted-foreground">
                {t("controls.awhp.setpoint")}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {fmt(a.setpointTemperature)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
