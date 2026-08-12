import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Droplets,
  Fan,
  GitCommitHorizontal,
  Wind,
} from "lucide-react";
import { DeviceType, isAwhp, readAwhpAttributes } from "@/lib/devices";
import { Badge } from "@/components/ui/badge";
import { AttributeValue } from "@/components/AttributeValue";
import { useAssetTree } from "@/hooks/useAssetTree";
import { fmt } from "@/lib/formatValue";
import { cn } from "@/lib/utils";
import { ControlPanel } from "../ControlPanel";
import type { StandardControlProps } from "../types";
import { cycleMedia, type CycleMedium } from "./cycleMedia";

type StageTone = "cold" | "neutral" | "hot";

const STAGE_HEADER_CLASS: Record<StageTone, string> = {
  cold: "text-hvac-cool",
  neutral: "text-muted-foreground",
  hot: "text-hvac-heat",
};

const STAGE_BOX_CLASS: Record<StageTone, string> = {
  cold: "border-hvac-cool/20 bg-hvac-cool/5",
  neutral: "border-border bg-muted/40",
  hot: "border-hvac-heat/20 bg-hvac-heat/5",
};

const MEDIUM_ICONS: Record<CycleMedium, LucideIcon> = {
  water: Droplets,
  air: Wind,
};

/** One exchanger box of the refrigerant cycle (evaporator / compressor /
 *  condenser), tinted by its thermal role. */
function CycleStage({
  tone,
  icon: Icon,
  label,
  children,
}: {
  tone: StageTone;
  icon: LucideIcon;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border p-4",
        STAGE_BOX_CLASS[tone],
      )}
    >
      <div
        className={cn("flex items-center gap-1.5", STAGE_HEADER_CLASS[tone])}
      >
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function Reading({
  label,
  value,
  unit = "",
}: {
  label: string;
  value: number | null;
  unit?: string;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-xs font-medium tabular-nums">
        {fmt(value, 1, unit)}
      </span>
    </div>
  );
}

function WaterReading({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">
        {fmt(value, 1, " °C")}
      </span>
    </div>
  );
}

export function AwhpControl({
  device,
  size = "lg",
}: StandardControlProps & { size?: "lg" | "full" }) {
  const { t } = useTranslation("devices");
  const { t: tTypes } = useTranslation("standardDevices");
  const { assetByDeviceId } = useAssetTree();

  if (!isAwhp(device)) return null;
  const a = readAwhpAttributes(device);
  const media = cycleMedia(a.mode);
  const heating = media.condenser === "water";
  const asset = assetByDeviceId[device.id];

  const typeLabel = tTypes(`${DeviceType.Awhp}.name`);
  const mediumHeadline = (medium: CycleMedium) =>
    medium === "water"
      ? `${t("controls.awhp.waterSide")} ${fmt(a.outletTemperature, 1, " °C")}`
      : `${t("controls.awhp.airSide")} ${fmt(a.outdoorTemperature, 1, " °C")}`;

  return (
    <ControlPanel size={size}>
      <div className="space-y-5">
        {/* ── Header: mode · type/location · run status ── */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {a.mode && (
              <Badge variant="info">
                <AttributeValue
                  deviceType={DeviceType.Awhp}
                  attributeName="mode"
                  value={a.mode}
                />
              </Badge>
            )}
            <span className="truncate text-sm text-muted-foreground">
              {typeLabel}
              {asset ? ` · ${asset.name}` : ""}
            </span>
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("controls.awhp.runStatus")} ·{" "}
            <span className="uppercase text-foreground">
              {a.unitRunStatus ?? "—"}
            </span>
          </span>
        </div>

        {/* ── Refrigerant cycle: evaporator → compressor → condenser ── */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-1 sm:gap-2">
          <CycleStage
            tone="cold"
            icon={MEDIUM_ICONS[media.evaporator]}
            label={t("controls.awhp.evaporator")}
          >
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {mediumHeadline(media.evaporator)}
            </span>
          </CycleStage>

          <div className="flex items-center justify-center px-1">
            <ArrowRight className="h-4 w-4 text-hvac-cool" />
          </div>

          <CycleStage
            tone="neutral"
            icon={Fan}
            label={t("controls.awhp.compressor")}
          >
            <div className="flex flex-col items-center gap-0.5">
              <Reading
                label={t("controls.awhp.suction")}
                value={a.compressorSuctionPressure}
                unit=" bar"
              />
              <Reading
                label={t("controls.awhp.discharge")}
                value={a.compressorDischargePressure}
                unit=" bar"
              />
            </div>
          </CycleStage>

          <div className="flex items-center justify-center px-1">
            <ArrowRight className="h-4 w-4 text-hvac-heat" />
          </div>

          <CycleStage
            tone="hot"
            icon={MEDIUM_ICONS[media.condenser]}
            label={t("controls.awhp.condenser")}
          >
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {mediumHeadline(media.condenser)}
            </span>
          </CycleStage>
        </div>

        {/* ── Expansion valve on the return path ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-dashed border-border" />
          <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1 text-muted-foreground">
            <GitCommitHorizontal className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">
              {t("controls.awhp.expansionValve")}
            </span>
          </div>
          <div className="flex-1 border-t border-dashed border-border" />
        </div>

        {/* ── Water circuit: inlet / outlet / setpoint ── */}
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl bg-muted/50 px-4 py-3">
          <div
            className={cn(
              "flex items-center gap-1.5",
              heating ? "text-hvac-heat" : "text-hvac-cool",
            )}
          >
            <Droplets className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {heating
                ? t("controls.awhp.waterSide")
                : t("controls.awhp.chilledWater")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <WaterReading
              label={t("controls.awhp.inlet")}
              value={a.inletTemperature}
            />
            <WaterReading
              label={t("controls.awhp.outlet")}
              value={a.outletTemperature}
            />
            {a.setpointTemperature != null && (
              <WaterReading
                label={t("controls.awhp.setpoint")}
                value={a.setpointTemperature}
              />
            )}
          </div>
        </div>
      </div>
    </ControlPanel>
  );
}
