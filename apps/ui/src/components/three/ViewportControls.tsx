import type { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  Building2,
  Layers,
  Layers2,
  Map as MapIcon,
  MapPin,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const BUTTON_CLASS =
  "h-8 w-8 rounded-lg border border-border bg-card/90 shadow-sm backdrop-blur";

/**
 * One icon button of the viewport chrome, with its tooltip.
 *
 * `soft` disables the control without `disabled`: the base Button styles carry
 * `disabled:pointer-events-none`, which would keep the very tooltip that
 * explains why it is unavailable from ever showing.
 */
const ControlButton: FC<{
  label: string;
  pressed?: boolean;
  soft?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}> = ({ label, pressed, soft, disabled, onClick, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(BUTTON_CLASS, soft && "opacity-50")}
        onClick={soft ? undefined : onClick}
        aria-pressed={pressed}
        aria-disabled={soft}
        disabled={disabled}
        aria-label={label}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="left">{label}</TooltipContent>
  </Tooltip>
);

/** Viewport chrome: switch to the 2D floor plan, re-frame the building,
 * stack / unstack its floors, glaze the facade, and toggle the device
 * markers. */
export const ViewportControls: FC<{
  exploded: boolean;
  facade: boolean;
  markers: boolean;
  /** The viewer currently shows the 2D floor plan. */
  planActive: boolean;
  /** A level is isolated, so a plan can be opened. */
  planEnabled: boolean;
  onToggleExplode: () => void;
  onToggleFacade: () => void;
  onToggleMarkers: () => void;
  onResetView: () => void;
  onTogglePlan: () => void;
}> = ({
  exploded,
  facade,
  markers,
  planActive,
  planEnabled,
  onToggleExplode,
  onToggleFacade,
  onToggleMarkers,
  onResetView,
  onTogglePlan,
}) => {
  const { t } = useTranslation("home");
  const planLabel = planActive
    ? t("zonesByLevel.viewer.planHide")
    : planEnabled
      ? t("zonesByLevel.viewer.planShow")
      : t("zonesByLevel.viewer.planNeedsLevel");

  return (
    <div className="pointer-events-auto flex flex-col gap-1.5">
      <ControlButton
        label={planLabel}
        pressed={planActive}
        soft={!planActive && !planEnabled}
        onClick={onTogglePlan}
      >
        {planActive ? (
          <Box className="h-4 w-4" />
        ) : (
          <MapIcon className="h-4 w-4" />
        )}
      </ControlButton>

      <ControlButton
        label={t("zonesByLevel.viewer.resetView")}
        onClick={onResetView}
      >
        <Maximize2 className="h-4 w-4" />
      </ControlButton>

      <ControlButton
        label={t(
          markers
            ? "zonesByLevel.viewer.markersHide"
            : "zonesByLevel.viewer.markersShow",
        )}
        pressed={markers}
        onClick={onToggleMarkers}
      >
        <MapPin className="h-4 w-4" />
      </ControlButton>

      <ControlButton
        label={t(
          facade
            ? "zonesByLevel.viewer.hideFacade"
            : "zonesByLevel.viewer.showFacade",
        )}
        pressed={facade}
        disabled={planActive}
        onClick={onToggleFacade}
      >
        <Building2 className="h-4 w-4" />
      </ControlButton>

      <ControlButton
        label={t(
          exploded
            ? "zonesByLevel.viewer.collapseFloors"
            : "zonesByLevel.viewer.explode",
        )}
        pressed={exploded}
        disabled={planActive}
        onClick={onToggleExplode}
      >
        {exploded ? (
          <Layers className="h-4 w-4" />
        ) : (
          <Layers2 className="h-4 w-4" />
        )}
      </ControlButton>
    </div>
  );
};
