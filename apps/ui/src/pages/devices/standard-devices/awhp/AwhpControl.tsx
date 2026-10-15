import { lazy, Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ValueLabel } from "@gridone/sdk";
import {
  DeviceType,
  deviceAttributes,
  isAwhp,
  readAwhpAttributes,
} from "@/lib/devices";
import { AttributeValue } from "@/components/AttributeValue";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useAttributeLabel } from "@/hooks/useAttributeLabel";
import { useReadingFormat } from "@/hooks/useReadingFormat";
import { attributeUnit } from "@/lib/attributeUnits";
import type { AttributeFields } from "@/lib/faults";
import { cn } from "@/lib/utils";
import type { StandardControlProps } from "../types";
import { readAwhpUnits } from "./units";

// The drawing is a large static SVG: it loads with the first heat pump
// page, not with the app.
const AwhpFigure = lazy(() => import("./AwhpFigure"));

const SETPOINT_WIRE = "setpoint_temperature";
const ONOFF_WIRE = "onoff_state";
const MODE_WIRE = "mode";
const SETPOINT_DIGITS = 1;

/** One line of the facts column: a muted label over its value. */
function Fact({
  label,
  detail,
  children,
}: {
  label: string;
  detail?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-sm font-medium text-foreground">
        {children}
      </div>
      {detail && (
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      )}
    </div>
  );
}

/** The heat pump control: the live figure of the unit, with what the
 *  drawing does not show (type, on/off and run status, mode, water
 *  setpoint) in a thin column beside it. No card around it: the drawing
 *  sits on the page itself. */
export function AwhpControl({
  device,
  size = "lg",
}: StandardControlProps & { size?: "lg" | "full" }) {
  const { t } = useTranslation("devices");
  const { t: tCommon } = useTranslation("common");
  const { t: tTypes } = useTranslation("standardDevices");
  const { assetByDeviceId } = useAssetTree();
  const attributeLabel = useAttributeLabel();
  const format = useReadingFormat();

  if (!isAwhp(device)) return null;
  const a = readAwhpAttributes(device);
  const units = readAwhpUnits(device);
  const asset = assetByDeviceId[device.id];
  const attributes = deviceAttributes(device);
  const setpointUnit = attributeUnit(SETPOINT_WIRE, attributes[SETPOINT_WIRE]);
  // The driver's wording of the two states when it declares one, else on/off.
  const onoff = attributes[ONOFF_WIRE] as AttributeFields | undefined;
  const declaredLabels = onoff?.value_labels;
  const fallbackLabels: ValueLabel[] = [
    { value: true, label: { default: t("controls.awhp.on") } },
    { value: false, label: { default: t("controls.awhp.off") } },
  ];
  const onoffLabels = declaredLabels?.length ? declaredLabels : fallbackLabels;

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 sm:flex-row sm:items-stretch sm:gap-8",
        size === "lg" && "max-w-3xl",
      )}
    >
      <div className="flex shrink-0 flex-wrap gap-x-8 gap-y-4 sm:w-32 sm:flex-col sm:justify-between sm:py-2">
        <Fact label={tCommon("common.type")} detail={asset?.name}>
          {tTypes(`${DeviceType.Awhp}.name`)}
        </Fact>
        <Fact
          label={attributeLabel(ONOFF_WIRE, attributes[ONOFF_WIRE])}
          detail={a.unitRunStatus}
        >
          {a.onoffState == null ? (
            "—"
          ) : (
            <AttributeValue
              deviceType={DeviceType.Awhp}
              attributeName={ONOFF_WIRE}
              value={a.onoffState}
              valueLabels={onoffLabels}
            />
          )}
        </Fact>
        <Fact label={attributeLabel(MODE_WIRE, attributes[MODE_WIRE])}>
          {a.mode == null ? (
            "—"
          ) : (
            <AttributeValue
              deviceType={DeviceType.Awhp}
              attributeName={MODE_WIRE}
              value={a.mode}
            />
          )}
        </Fact>
        {a.setpointTemperature != null && (
          <Fact label={t("controls.awhp.setpoint")}>
            <span className="font-mono tabular-nums">
              {format(a.setpointTemperature, SETPOINT_DIGITS, setpointUnit)}
            </span>
          </Fact>
        )}
      </div>

      <Suspense
        fallback={
          <div
            className="aspect-[620/410] w-full max-w-xl animate-pulse rounded-xl bg-muted/40"
            aria-hidden="true"
          />
        }
      >
        <AwhpFigure values={a} units={units} className="w-full max-w-xl" />
      </Suspense>
    </div>
  );
}
