import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Cpu } from "lucide-react";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useDevicesList } from "@/hooks/useDevicesList";
import { useDeviceSearch } from "@/hooks/useDeviceSearch";
import { useFaultsList } from "@/hooks/useFaultsList";
import { ancestorPathOf } from "@/lib/assets";
import { deviceTypeIcon } from "@/lib/deviceTypes";
import { faultLabel } from "@/lib/faultLabel";
import { filterGlobalSearch } from "@/lib/deviceSearch";
import { serializeResourceReference } from "@/lib/resourceReference";
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
 *  own, and the detail's active-faults section carries the full context.
 *
 *  The overflow hint renders beside the devices group, never inside its
 *  heading: cmdk derives a group's ``data-value`` and its accessible name from
 *  the heading's text, so a count in there would rename the group on every
 *  keystroke. */
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

  const deviceSearch = useDeviceSearch(devices);
  const isLoading = assetsLoading || devicesLoading || faultsLoading;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) deviceSearch.setQuery("");
    onOpenChange(nextOpen);
  };

  const goTo = (path: string) => {
    handleOpenChange(false);
    navigate(path);
  };

  /** Nothing has been searched yet on open, so the fleet is merely capped —
   *  only a typed query leaves matches out. */
  const overflowMessage = deviceSearch.query.trim()
    ? t("topbar.search.moreDevices", { count: deviceSearch.overflow })
    : t("topbar.search.showingDevices", {
        shown: deviceSearch.devices.length,
        total: deviceSearch.devices.length + deviceSearch.overflow,
      });

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      label={t("topbar.search.label")}
      description={t("topbar.search.description")}
      filter={filterGlobalSearch}
    >
      <CommandInput
        placeholder={t("topbar.search.placeholder")}
        value={deviceSearch.query}
        onValueChange={deviceSearch.setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isLoading ? t("topbar.search.loading") : t("topbar.search.empty")}
        </CommandEmpty>
        <CommandGroup heading={t("topbar.search.groups.devices")}>
          {deviceSearch.devices.map((device) => {
            const Icon = deviceTypeIcon(device.type) ?? Cpu;
            return (
              <CommandItem
                key={device.id}
                value={serializeResourceReference({
                  type: "device",
                  id: device.id,
                })}
                keywords={[device.name, device.id]}
                onSelect={() => goTo(`/devices/${device.id}`)}
              >
                <Icon
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{device.name || device.id}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {deviceSearch.overflow > 0 && (
          <div
            role="status"
            className="px-4 pb-2 text-xs text-muted-foreground"
          >
            {overflowMessage}
          </div>
        )}
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
