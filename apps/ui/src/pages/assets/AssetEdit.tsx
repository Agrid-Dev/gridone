import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResourceHeader } from "@/components/ResourceHeader";
import { getAsset, updateAsset } from "@/api/assets";
import type { Asset, AssetUpdatePayload } from "@/api/assets";
import { AssetForm } from "./components/AssetForm";
import type { AssetFormValues } from "./components/AssetForm";

export default function AssetEdit() {
  const { t } = useTranslation();
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: asset, isLoading } = useQuery<Asset>({
    queryKey: ["assets", assetId],
    queryFn: () => getAsset(assetId!),
    enabled: !!assetId,
  });

  const mutation = useMutation({
    mutationFn: (data: AssetUpdatePayload) => updateAsset(assetId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("assets.updated"));
      navigate(`/assets/${assetId}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !asset) {
    return (
      <div className="space-y-4">
        <div className="h-10 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
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
        title={t("assets.edit")}
        resourceName={t("assets.title")}
        resourceNameLinksBack
      />

      <div className="rounded-lg border border-slate-200 bg-white p-6">
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
