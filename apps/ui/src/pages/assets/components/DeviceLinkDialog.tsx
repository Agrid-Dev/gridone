import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { listDevices } from "@/api/devices";
import type { Device } from "@/api/devices";
import { linkDevice } from "@/api/assets";

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: devices = [] } = useQuery<Device[]>({
    queryKey: ["devices"],
    queryFn: listDevices,
    enabled: open,
  });

  const available = devices.filter(
    (d) =>
      !existingDeviceIds.includes(d.id) &&
      (d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.id.toLowerCase().includes(search.toLowerCase())),
  );

  const mutation = useMutation({
    mutationFn: (deviceId: string) => linkDevice(assetId, deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["assets", assetId, "devices"],
      });
      toast.success(t("assets.devices.linked"));
      setSelectedId(null);
      setSearch("");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assets.devices.selectDevice")}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder={t("assets.devices.selectDevice")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-60 overflow-y-auto rounded-md border border-slate-200">
          {available.length > 0 ? (
            available.map((device) => (
              <button
                key={device.id}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  selectedId === device.id ? "bg-slate-100 font-medium" : ""
                }`}
                onClick={() => setSelectedId(device.id)}
              >
                <span className="truncate">{device.name}</span>
                <span className="ml-auto text-xs text-slate-400 truncate">
                  {device.id}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-slate-500 text-center">
              {t("common.noResults")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!selectedId || mutation.isPending}
            onClick={() => selectedId && mutation.mutate(selectedId)}
          >
            {t("assets.devices.link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
