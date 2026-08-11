import { useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { Asset, Device } from "@gridone/sdk";
import { useFaultsList } from "@/hooks/useFaultsList";
import type { RoomState } from "./roomStates";

/**
 * Floating pill surfacing the worst active alert of the building, joined to
 * its room through the asset tree. Clicking focuses the room in the scene.
 */
export const AlertPill: FC<{
  devices: Device[];
  assets: Asset[];
  roomStates: Map<string, RoomState>;
  onFocusRoom: (globalId: string) => void;
}> = ({ devices, assets, roomStates, onFocusRoom }) => {
  const { t } = useTranslation("home");
  const { faults } = useFaultsList();

  const alert = useMemo(() => {
    const deviceById = new Map(devices.map((device) => [device.id, device]));
    const globalIdByAssetId = new Map<string, string>();
    for (const state of roomStates.values()) {
      if (state.assetId) {
        globalIdByAssetId.set(state.assetId, state.globalId);
      }
    }
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));
    for (const fault of faults) {
      if (fault.severity !== "alert") {
        continue;
      }
      const assetId = deviceById.get(fault.device_id)?.tags?.asset_id;
      if (!assetId) {
        continue;
      }
      const globalId = globalIdByAssetId.get(assetId);
      if (!globalId) {
        continue;
      }
      return {
        globalId,
        deviceName: fault.device_name,
        roomName: assetById.get(assetId)?.name ?? "",
      };
    }
    return null;
  }, [faults, devices, assets, roomStates]);

  if (!alert) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => onFocusRoom(alert.globalId)}
      className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-status-error/40 bg-status-error/10 px-3 py-1.5 text-xs font-medium text-status-error shadow-sm backdrop-blur transition-colors hover:bg-status-error/20"
      aria-label={t("zonesByLevel.viewer.alertLabel")}
    >
      <TriangleAlert className="h-3.5 w-3.5 animate-pulse" aria-hidden />
      <span className="truncate">
        {t("zonesByLevel.viewer.alertText", {
          device: alert.deviceName,
          room: alert.roomName,
        })}
      </span>
    </button>
  );
};
