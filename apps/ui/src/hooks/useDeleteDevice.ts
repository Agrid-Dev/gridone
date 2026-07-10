import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isGridoneError } from "@gridone/sdk";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useGridoneClient } from "@/contexts/GridoneClientContext";

export const useDeleteDevice = () => {
  const navigate = useNavigate();
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { t } = useTranslation(["devices", "common"]);
  const deleteMutation = useMutation({
    mutationFn: (deviceId: string) => client.devices.delete(deviceId),
    onSuccess: () => {
      navigate("/devices");
      toast.success(t("devices.feedback.deleted"));
    },
    onError: (err: Error) => {
      const detail = isGridoneError(err)
        ? err.detail || err.message
        : err.message;
      const errorMessage = `${t("common:errors.default")}: ${detail}`;
      toast.error(errorMessage);
    },
    onSettled: () => {
      queryClient.refetchQueries({ queryKey: ["devices"] });
    },
  });
  const handleDelete = async (deviceId: string) => {
    deleteMutation.mutateAsync(deviceId);
  };

  return { handleDelete, isDeleting: deleteMutation.isPending };
};
