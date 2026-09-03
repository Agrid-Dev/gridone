import { useTranslation } from "react-i18next";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import type { Asset, AssetCreate, AssetType, AssetUsage } from "@gridone/sdk";
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
 *  `usage` is sent only when the form actually states it: on a level that can
 *  carry a usage, or when the operator changed it — clearing it included. A
 *  re-type that leaves the stored usage untouched omits the field instead of
 *  nulling it, so the backend guard fires ("clear its usage first") rather
 *  than the form dropping a classification behind the operator's back.
 *
 *  `storedUsage` is what the asset currently carries (`null` when creating). */
export function toAssetPayload(
  data: AssetFormValues,
  storedUsage: AssetUsage | null = null,
): AssetCreate {
  const statesUsage = canCarryUsage(data.type) || data.usage !== storedUsage;
  return {
    name: data.name,
    type: data.type,
    parent_id: data.parentId,
    ...(statesUsage ? { usage: data.usage } : {}),
  };
}

/** Whether the usage select belongs on screen for a form in this state.
 *
 *  Shown on a level that can carry a usage, and on any other level while a
 *  usage is still set: a classified room re-typed to a floor keeps its select
 *  so the operator can clear the usage in that same form — the only way past
 *  the backend guard. */
export function showsUsageField(
  type: AssetType,
  usage: AssetUsage | null,
): boolean {
  return canCarryUsage(type) || usage !== null;
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
  const selectedUsage = useWatch({ control: form.control, name: "usage" });

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

      {showsUsageField(selectedType, selectedUsage) && (
        <SelectController
          name="usage"
          control={form.control}
          label={t("fields.usage")}
          description={
            canCarryUsage(selectedType)
              ? t("fields.usageHint")
              : t("fields.usageClearFirst")
          }
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
