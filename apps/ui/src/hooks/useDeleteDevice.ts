import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteDevice } from "@/api/devices";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { ApiError } from "@/api/apiError";

export const useDeleteDevice = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const deleteMutation = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => {
      navigate("..");
      toast.success(t("devices.feedback.deleted"));
    },
    onError: (err: ApiError) => {
      const errorMessage = `${t("errors.default")}: ${err.details || err.message}`;
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
