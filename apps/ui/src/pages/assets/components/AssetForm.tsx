import { useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import type { Asset, AssetCreate } from "@gridone/sdk";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { ASSET_TYPES, ASSET_USAGES, canCarryUsage } from "@/lib/assets";

/**
 * Zod schema mirroring the Pydantic AssetCreate model constraints:
 *   name:  str  Field(min_length=1, max_length=128, strip_whitespace=True)
 *   type:  AssetType (StrEnum: org | building | floor | room | zone)
 *   parentId: required UUID string
 *   usage: AssetUsage | null — null is "not classified yet"
 */
export const assetFormSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(ASSET_TYPES),
  parentId: z.string().min(1),
  usage: z.enum(ASSET_USAGES).nullable(),
});

export type AssetFormValues = z.infer<typeof assetFormSchema>;

/** Wire payload for the form's values, shared by the create and edit routes.
 *
 *  A level that cannot carry a usage sends an explicit `null`: its usage
 *  select is hidden, and the backend refuses to drop a usage silently when a
 *  classified zone is re-typed — so the form states the clearing itself. The
 *  chosen usage survives a room → floor → room round trip in the form. */
export function toAssetPayload(data: AssetFormValues): AssetCreate {
  return {
    name: data.name,
    type: data.type,
    parent_id: data.parentId,
    usage: canCarryUsage(data.type) ? data.usage : null,
  };
}

/** Select options for the usage field, labelled from the `usages` catalog. */
export function useUsageOptions() {
  const { t } = useTranslation("assets");
  return ASSET_USAGES.map((usage) => ({
    value: usage,
    label: t(`usages.${usage}`),
  }));
}

type AssetFormProps = {
  defaultValues: AssetFormValues;
  onSubmit: (data: AssetFormValues) => void;
  isPending: boolean;
  isEdit?: boolean;
  /** Asset ID being edited — excluded from parent options */
  excludeId?: string;
};

export function AssetForm({
  defaultValues,
  onSubmit,
  isPending,
  isEdit = false,
  excludeId,
}: AssetFormProps) {
  const { t } = useTranslation(["assets", "common"]);
  const client = useGridoneClient();

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues,
  });

  const { data: allAssets = [] } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: () => client.assets.list(),
  });

  const parentOptions = allAssets
    .filter((a) => a.id !== excludeId)
    .map((a) => ({ value: a.id, label: a.name }));

  const typeOptions = ASSET_TYPES.map((type) => ({
    value: type,
    label: t(`types.${type}`) as string,
  }));
  const usageOptions = useUsageOptions();
  const selectedType = useWatch({ control: form.control, name: "type" });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <InputController
        name="name"
        control={form.control}
        label={t("fields.name")}
        required
      />

      <SelectController
        name="type"
        control={form.control}
        label={t("fields.type")}
        options={typeOptions}
        required
      />

      <SelectController
        name="parentId"
        control={form.control}
        label={t("fields.parent")}
        options={parentOptions}
        placeholder={t("fields.parentPlaceholder")}
        required
      />

      {canCarryUsage(selectedType) && (
        <SelectController
          name="usage"
          control={form.control}
          label={t("fields.usage")}
          description={t("fields.usageHint")}
          options={usageOptions}
          placeholder={t("fields.usageNone")}
          allowEmpty
          emptyValue={null}
          emptyLabel={t("fields.usageNone")}
        />
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? t("common:common.saving")
            : isEdit
              ? t("common:common.save")
              : t("common:common.create")}
        </Button>
      </div>
    </form>
  );
}
