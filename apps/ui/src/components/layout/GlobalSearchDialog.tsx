import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Cpu } from "lucide-react";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useFaultsList } from "@/hooks/useFaultsList";
import { ancestorPathOf } from "@/lib/assets";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { faultLabel } from "@/lib/faultLabel";
import { sortedByName } from "@/lib/sortByName";
import { FaultSeverityIcon } from "@/components/FaultSeverityIcon";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

/** Global palette over devices, zones and faults. Sole caller of
 *  ``useAssetTree`` in the shell: the tree is the heaviest read in the app
 *  and the topbar mounts on every route, so this component (and therefore
 *  its three queries) is rendered only once the palette has been opened.
 *
 *  Every asset type is searchable, not just ``type === "zone"`` — which level
 *  models a "zone" is a deployment choice, so filtering here would hide
 *  legitimate results (same rationale as ``AssetPicker``).
 *
 *  A fault opens its device's detail page — faults have no page of their
 *  own, and the detail's active-faults section carries the full context. */
export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { assetsList, assetsById, isLoading: assetsLoading } = useAssetTree();
  const { devices, loading: devicesLoading } = useDevicesList();
  const { faults, loading: faultsLoading } = useFaultsList();

  const sortedDevices = useMemo(() => sortedByName(devices), [devices]);
  const isLoading = assetsLoading || devicesLoading || faultsLoading;

  const goTo = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("topbar.search.label")}
      description={t("topbar.search.description")}
    >
      <CommandInput placeholder={t("topbar.search.placeholder")} />
      <CommandList>
        <CommandEmpty>
          {isLoading ? t("topbar.search.loading") : t("topbar.search.empty")}
        </CommandEmpty>
        <CommandGroup heading={t("topbar.search.groups.devices")}>
          {sortedDevices.map((device) => {
            const Icon = deviceTypeIcon(device.type) ?? Cpu;
            return (
              <CommandItem
                key={device.id}
                value={`${device.name} ${device.id}`}
                onSelect={() => goTo(`/devices/${device.id}`)}
              >
                <Icon
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{device.name}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("topbar.search.groups.zones")}>
          {assetsList.map((asset) => {
            const ancestors = ancestorPathOf(asset, assetsById);
            return (
              <CommandItem
                key={asset.id}
                value={`${asset.name} ${ancestors} ${asset.id}`}
                onSelect={() => goTo(`/assets/${asset.id}`)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{asset.name}</span>
                  {ancestors && (
                    <span className="truncate text-xs text-muted-foreground">
                      {ancestors}
                    </span>
                  )}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t("topbar.search.groups.faults")}>
          {faults.map((fault) => {
            const label = faultLabel({
              name: fault.attribute_name,
              data_type: fault.data_type,
              current_value: fault.current_value,
            });
            return (
              <CommandItem
                key={`${fault.device_id}:${fault.attribute_name}`}
                value={`${fault.device_name} ${label} ${fault.device_id}:${fault.attribute_name}`}
                onSelect={() => goTo(`/devices/${fault.device_id}`)}
              >
                <FaultSeverityIcon severity={fault.severity} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{fault.device_name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {label}
                  </span>
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
