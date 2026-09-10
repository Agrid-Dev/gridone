import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Device } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useAssetTree } from "@/hooks/useAssetTree";
import {
  ASSET_TAG,
  useDeviceAssetAssignments,
} from "@/hooks/useDeviceAssetAssignments";
import { zonePathOf } from "@/lib/assets";
import { sortedByName } from "@/lib/sortByName";

type DeviceLinkDialogProps = {
  assetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingDeviceIds: string[];
};

export function DeviceLinkDialog({
  assetId,
  open,
  onOpenChange,
  existingDeviceIds,
}: DeviceLinkDialogProps) {
  const { t } = useTranslation(["assets", "common"]);
  const client = useGridoneClient();
  const assign = useDeviceAssetAssignments();
  const { assetsById } = useAssetTree();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const {
    data: devices = [],
    isLoading,
    error,
  } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: () => client.devices.list(),
    enabled: open,
  });

  // A closed dialog keeps nothing: reopening it starts from an empty basket,
  // so a selection abandoned yesterday never links a device by surprise.
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedIds([]);
    }
  }, [open]);

  const available = useMemo(
    () =>
      sortedByName(devices.filter((d) => !existingDeviceIds.includes(d.id))),
    [devices, existingDeviceIds],
  );

  const needle = search.trim().toLowerCase();
  const matching = useMemo(
    () =>
      needle
        ? available.filter(
            (d) =>
              d.name.toLowerCase().includes(needle) ||
              d.id.toLowerCase().includes(needle),
          )
        : available,
    [available, needle],
  );

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allMatchingSelected =
    matching.length > 0 && matching.every((d) => selected.has(d.id));
  const someMatchingSelected =
    matching.some((d) => selected.has(d.id)) && !allMatchingSelected;

  const toggleOne = (deviceId: string) => {
    const next = new Set(selected);
    if (next.has(deviceId)) next.delete(deviceId);
    else next.add(deviceId);
    setSelectedIds([...next]);
  };

  /** Select-all reaches the matching devices only: a search narrows what the
   *  checkbox acts on, never what is already in the basket. */
  const toggleMatching = () => {
    const next = new Set(selected);
    for (const device of matching) {
      if (allMatchingSelected) next.delete(device.id);
      else next.add(device.id);
    }
    setSelectedIds([...next]);
  };

  const currentZoneOf = (device: Device): string | null => {
    const current = device.tags?.[ASSET_TAG];
    const asset = current ? assetsById[current] : undefined;
    if (!asset) return null;
    return zonePathOf(asset, assetsById) || asset.name;
  };

  const submit = () => {
    assign.mutate(
      selectedIds.map((deviceId) => ({
        device_id: deviceId,
        asset_id: assetId,
      })),
      {
        onSuccess: (outcome) => {
          if (outcome.failed.length > 0) {
            toast.error(
              t("devices.linkFailed", { count: outcome.failed.length }),
            );
          } else {
            toast.success(
              t("devices.linkedCount", { count: outcome.applied.length }),
            );
          }
          onOpenChange(false);
        },
        onError: (err: Error) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("devices.selectDevices")}</DialogTitle>
          <DialogDescription>{t("devices.selectHint")}</DialogDescription>
        </DialogHeader>

        <Input
          placeholder={t("devices.searchDevices")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allMatchingSelected}
              disabled={matching.length === 0}
              ref={(el) => {
                if (el) el.indeterminate = someMatchingSelected;
              }}
              onChange={toggleMatching}
            />
            {t("devices.selectAllMatching")}
          </label>
          <span className="text-muted-foreground">
            {t("devices.selectedCount", { count: selectedIds.length })}
          </span>
        </div>

        <div className="max-h-60 overflow-y-auto rounded-md border border-border">
          {isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-6" />
              ))}
            </div>
          ) : error ? (
            <p className="px-3 py-4 text-sm text-destructive text-center">
              {t("devices.loadError")}
            </p>
          ) : matching.length > 0 ? (
            matching.map((device) => {
              const zone = currentZoneOf(device);
              return (
                <label
                  key={device.id}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={selected.has(device.id)}
                    onChange={() => toggleOne(device.id)}
                    aria-label={device.name || device.id}
                  />
                  <span className="truncate">{device.name || device.id}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {zone ?? t("devices.noZone")}
                  </span>
                </label>
              );
            })
          ) : (
            <p className="px-3 py-4 text-sm text-muted-foreground text-center">
              {t("common:common.noResults")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:common.cancel")}
          </Button>
          <Button
            disabled={selectedIds.length === 0 || assign.isPending}
            onClick={submit}
          >
            {t("devices.linkCount", { count: selectedIds.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
