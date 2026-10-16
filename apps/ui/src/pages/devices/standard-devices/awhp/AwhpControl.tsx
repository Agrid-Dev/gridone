import { useTranslation } from "react-i18next";
import type { ValueLabel } from "@gridone/sdk";
import {
  DeviceType,
  deviceAttributes,
  isAwhp,
  readAwhpAttributes,
} from "@/lib/devices";
import { AttributeValue } from "@/components/AttributeValue";
import { SynopticCard } from "@/components/synoptic/duct";
import { Badge } from "@/components/ui/badge";
import { useReadingFormat } from "@/hooks/useReadingFormat";
import { attributeUnit } from "@/lib/attributeUnits";
import type { AttributeFields } from "@/lib/faults";
import { cn } from "@/lib/utils";
import type { StandardControlProps } from "../types";
import { AwhpSynoptic } from "./AwhpSynoptic";
import { readAwhpUnits } from "./units";

const SETPOINT_WIRE = "setpoint_temperature";
const ONOFF_WIRE = "onoff_state";
const MODE_WIRE = "mode";
const SETPOINT_DIGITS = 1;

/** The heat pump control: the unit drawn with the synoptics kit in a card,
 *  with what the drawing does not show on the rail above it: on/off and
 *  the run status, the mode, the water setpoint. */
export function AwhpControl({
  device,
  size = "lg",
}: StandardControlProps & { size?: "lg" | "full" }) {
  const { t } = useTranslation("devices");
  const format = useReadingFormat();

  if (!isAwhp(device)) return null;
  const a = readAwhpAttributes(device);
  const units = readAwhpUnits(device);
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

  const rail = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {a.onoffState != null && (
        <Badge variant="outline" className="gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              a.onoffState ? "bg-status-ok" : "bg-muted-foreground",
            )}
          />
          <AttributeValue
            deviceType={DeviceType.Awhp}
            attributeName={ONOFF_WIRE}
            value={a.onoffState}
            valueLabels={onoffLabels}
          />
          {a.unitRunStatus && (
            <span className="font-normal text-muted-foreground">
              · {a.unitRunStatus}
            </span>
          )}
        </Badge>
      )}
      {a.mode != null && (
        <Badge variant="outline">
          <AttributeValue
            deviceType={DeviceType.Awhp}
            attributeName={MODE_WIRE}
            value={a.mode}
          />
        </Badge>
      )}
      {a.setpointTemperature != null && (
        <Badge variant="outline" className="gap-1.5">
          <span className="font-normal text-muted-foreground">
            {t("controls.awhp.setpoint")}
          </span>
          <span className="tabular-nums">
            {format(a.setpointTemperature, SETPOINT_DIGITS, setpointUnit)}
          </span>
        </Badge>
      )}
    </div>
  );

  return (
    <SynopticCard
      rail={rail}
      className={cn("mx-auto w-full", size === "lg" && "max-w-3xl")}
    >
      <AwhpSynoptic
        values={a}
        units={units}
        fault={device.is_faulty ? "alert" : null}
        className="mx-auto w-full max-w-2xl"
      />
    </SynopticCard>
  );
}
