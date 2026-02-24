import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResourceHeader } from "@/components/ResourceHeader";
import { createAsset, listAssets } from "@/api/assets";
import type { Asset, AssetCreatePayload } from "@/api/assets";
import { AssetForm } from "./components/AssetForm";
import type { AssetFormValues } from "./components/AssetForm";

export default function AssetCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const parentIdParam = searchParams.get("parentId");

  // Fetch all assets so we can find the root when no parentId is provided
  const { data: allAssets = [] } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: () => listAssets(),
  });

  const rootAsset = allAssets.find((a) => a.parentId === null);
  const parentId = parentIdParam ?? rootAsset?.id ?? "";

  const mutation = useMutation({
    mutationFn: (data: AssetCreatePayload) => createAsset(data),
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("assets.created"));
      navigate(`/assets/${asset.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

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
        title={t("assets.create")}
        resourceName={t("assets.title")}
        resourceNameLinksBack
      />

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <AssetForm
          defaultValues={{ name: "", type: "building", parentId }}
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
        />
      </div>
    </section>
  );
}
