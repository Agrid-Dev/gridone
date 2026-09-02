import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ResourceHeader } from "@/components/ResourceHeader";
import type {
  Asset,
  AssetCreate as AssetCreatePayload,
  AssetType,
} from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { AssetForm, toAssetPayload } from "./components/AssetForm";
import type { AssetFormValues } from "./components/AssetForm";
import { ASSET_TYPES } from "@/lib/assets";

export default function AssetCreate() {
  const { t } = useTranslation("assets");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const client = useGridoneClient();
  const [searchParams] = useSearchParams();
  const parentIdParam = searchParams.get("parentId");
  const typeParam = searchParams.get("type");
  const defaultType: AssetType = ASSET_TYPES.includes(typeParam as AssetType)
    ? (typeParam as AssetType)
    : "building";

  // Fetch all assets so we can find the root when no parentId is provided
  const { data: allAssets = [] } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: () => client.assets.list(),
  });

  const rootAsset = allAssets.find((a) => !a.parent_id);
  const parentId = parentIdParam ?? rootAsset?.id ?? "";

  const mutation = useMutation({
    mutationFn: (data: AssetCreatePayload) => client.assets.create(data),
    onSuccess: (asset) => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("created"));
      navigate(`/assets/${asset.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (data: AssetFormValues) => {
    mutation.mutate(toAssetPayload(data));
  };

  return (
    <section className="space-y-6">
      <ResourceHeader title={t("create")} />

      <div className="rounded-2xl border border-border bg-card p-6">
        <AssetForm
          defaultValues={{ name: "", type: defaultType, parentId, usage: null }}
          onSubmit={handleSubmit}
          isPending={mutation.isPending}
        />
      </div>
    </section>
  );
}
