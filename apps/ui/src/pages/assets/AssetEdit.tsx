import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResourceHeader } from "@/components/ResourceHeader";
import { useBreadcrumb } from "@/components/BreadcrumbProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourceDeleteButton } from "@/components/ResourceDeleteButton";
import { getAsset, updateAsset, deleteAsset } from "@/api/assets";
import type { Asset, AssetUpdatePayload } from "@/api/assets";
import { AssetForm } from "./components/AssetForm";
import type { AssetFormValues } from "./components/AssetForm";
import { usePermissions } from "@/contexts/AuthContext";

export default function AssetEdit() {
  const { t } = useTranslation("assets");
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const can = usePermissions();

  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ["assets", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: !!assetId,
  });

  const mutation = useMutation({
    mutationFn: (data: AssetUpdatePayload) => updateAsset(assetId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("updated"));
      navigate(`/assets/${assetId}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAsset(assetId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("deleted"));
      navigate("/assets");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useBreadcrumb([
    { to: `/assets/${assetId}`, label: asset?.name || assetId },
    { to: `/assets/${assetId}/edit`, labelKey: "breadcrumb.edit" },
  ]);

  if (isLoading || !asset) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const handleSubmit = (data: AssetFormValues) => {
    mutation.mutate({
      name: data.name,
      type: data.type,
      parentId: data.parentId,
    });
  };

  return (
    <section className="space-y-6">
      <ResourceHeader
        title={t("edit")}
        resourceName={t("title")}
        actions={
          can("assets:write") ? (
            <ResourceDeleteButton
              onDelete={() => deleteMutation.mutate()}
              isDeleting={deleteMutation.isPending}
              confirmTitle={t("deleteConfirmTitle")}
              confirmDetails={t("deleteConfirmDetails", { name: asset.name })}
            />
          ) : undefined
        }
      />

      <div className="rounded-2xl border border-border bg-card p-6">
        <AssetForm
          defaultValues={{
            name: asset.name,
            type: asset.type,
            parentId: asset.parentId ?? "",
          }}
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
          isEdit
          excludeId={assetId}
        />
      </div>
    </section>
  );
}
