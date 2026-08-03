import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { serverErrorMessage } from "@/lib/serverErrorMessage";

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
      const detail = serverErrorMessage(err);
      const base = t("common:errors.default");
      toast.error(detail ? `${base}: ${detail}` : base);
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
