import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useResourceNavigation } from "./useResourceNavigation";
import { markResourceDeleted } from "@/lib/navigation";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export const useDeleteDevice = () => {
  const { back } = useResourceNavigation();
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { t } = useTranslation(["devices", "common"]);
  const deleteMutation = useMutation({
    mutationFn: (deviceId: string) => client.devices.delete(deviceId),
    onSuccess: async (_, deviceId) => {
      markResourceDeleted(`/devices/${deviceId}`);
      await Promise.all(
        ["devices", "assets", "faults", "transport"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      back("/devices");
      queryClient.removeQueries({
        queryKey: ["device", deviceId],
        type: "inactive",
      });
      toast.success(t("devices.feedback.deleted"));
    },
    onError: () => toast.error(t("common:deletion.error")),
  });
  const handleDelete = async (deviceId: string) => {
    return deleteMutation.mutateAsync(deviceId);
  };

  return { handleDelete, isDeleting: deleteMutation.isPending };
};
