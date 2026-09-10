import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isGridoneError } from "@gridone/sdk";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { downloadBlob } from "@/lib/download";
import { serverErrorMessage } from "@/lib/serverErrorMessage";
import { packageDiagnostics } from "./packageDiagnostics";

export type DriverPackageInput = { driverId: string; body: Blob };

export function useDriverPresentation(driverId: string) {
  const client = useGridoneClient();
  return useQuery({
    queryKey: ["driver-presentation", driverId],
    queryFn: () => client.drivers.getPresentation(driverId),
    // Keep the revision the author reviewed until they explicitly reload it.
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useDriverPackage(expected?: {
  revision: string | undefined;
  ready: boolean;
}) {
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation(["drivers", "common"]);
  const mutation = useMutation({
    mutationFn: ({ driverId, body }: DriverPackageInput) =>
      client.drivers.installPackage(driverId, body, {
        expectedRevision: expected?.revision,
      }),
    retry: false,
    onSuccess: async (driver) => {
      queryClient.setQueryData(["driver", driver.id], driver);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["drivers"] }),
        queryClient.invalidateQueries({
          queryKey: ["driver-presentation", driver.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["devices"] }),
      ]);
      toast.success(t("package.installed", { driverId: driver.id }));
      navigate(`/drivers/${encodeURIComponent(driver.id)}`);
    },
  });
  const conflict =
    expected !== undefined &&
    isGridoneError(mutation.error) &&
    mutation.error.status === 409;
  const diagnostics = packageDiagnostics(mutation.error);
  const blocked =
    mutation.isPending ||
    conflict ||
    (expected !== undefined && !expected.ready);
  const submit = async (payload: DriverPackageInput) => {
    if (blocked) return;
    try {
      await mutation.mutateAsync(payload);
    } catch {
      // The form renders mutation errors without losing the selected file.
    }
  };
  return {
    submit,
    blocked,
    pending: mutation.isPending,
    conflict,
    diagnostics,
    error:
      mutation.error && !conflict && diagnostics.length === 0
        ? (serverErrorMessage(mutation.error) ?? t("common:errors.default"))
        : undefined,
    reset: mutation.reset,
  };
}

export function useDriverReplacement(driverId: string) {
  const query = useDriverPresentation(driverId);
  const installation = useDriverPackage({
    revision: query.data?.revision,
    ready: query.isSuccess && !query.isFetching,
  });
  const reload = async () => {
    const result = await query.refetch();
    if (result.isSuccess) installation.reset();
  };
  return { query, ...installation, reload };
}

export function useExportDriverPackage(driverId: string) {
  const client = useGridoneClient();
  const { t } = useTranslation(["drivers", "common"]);
  const mutation = useMutation({
    mutationFn: () => client.drivers.exportPackage(driverId),
    onSuccess: (blob) => downloadBlob(blob, `${driverId}.zip`),
    onError: () => toast.error(t("package.exportFailed")),
  });
  return {
    exportPackage: () => mutation.mutate(),
    exporting: mutation.isPending,
  };
}
