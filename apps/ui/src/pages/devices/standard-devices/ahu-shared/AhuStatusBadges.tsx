import { DeviceType } from "@/api/devices";
import { AttributeValue } from "@/components/AttributeValue";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAhuSynopticLabel } from "./labels";

type AhuStatusBadgesProps = {
  deviceType: DeviceType;
  onoffState?: boolean | null;
  hvacMode?: string | null;
};

/** Running/stopped and HVAC-mode badges shown above an AHU synoptic;
 *  renders nothing when the device exposes neither attribute. */
export function AhuStatusBadges({
  deviceType,
  onoffState,
  hvacMode,
}: AhuStatusBadgesProps) {
  const label = useAhuSynopticLabel();

  if (onoffState == null && !hvacMode) return null;

  return (
    <div className="mb-3 flex items-center gap-2">
      {onoffState != null && (
        <Badge variant="outline" className="gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              onoffState ? "bg-status-ok" : "bg-muted-foreground",
            )}
          />
          {onoffState ? label("on") : label("off")}
        </Badge>
      )}
      {hvacMode && (
        <Badge variant="outline">
          <AttributeValue
            deviceType={deviceType}
            attributeName="hvac_mode"
            value={hvacMode}
          />
        </Badge>
      )}
    </div>
  );
}
