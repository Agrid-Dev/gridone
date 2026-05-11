import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export type DeviceDiscoverySwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
};

export const DeviceDiscoverySwitch: FC<DeviceDiscoverySwitchProps> = ({
  checked,
  onCheckedChange,
  disabled,
  loading,
}) => {
  const { t } = useTranslation("devices");
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border px-4 py-3 md:col-span-2">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          {t("devices.fields.discoverDevicesLikeMe")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("devices.fields.discoverDevicesLikeMeHelp")}
        </p>
      </div>
      <div className="flex items-center gap-2 pt-1">
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled || loading}
        />
      </div>
    </div>
  );
};

export default DeviceDiscoverySwitch;
