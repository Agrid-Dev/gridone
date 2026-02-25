import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { InputController } from "@/components/forms/controllers/InputController";
import { SelectController } from "@/components/forms/controllers/SelectController";
import { ASSET_TYPES, listAssets } from "@/api/assets";
import type { Asset } from "@/api/assets";

/**
 * Zod schema mirroring the Pydantic AssetCreate model constraints:
 *   name:  str  Field(min_length=1, max_length=128, strip_whitespace=True)
 *   type:  AssetType (StrEnum: org | building | floor | room | zone)
 *   parentId: required UUID string
 */
const assetFormSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(ASSET_TYPES),
  parentId: z.string().min(1),
});

export type AssetFormValues = z.infer<typeof assetFormSchema>;

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
  const { t } = useTranslation();

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues,
  });

  const { data: allAssets = [] } = useQuery<Asset[]>({
    queryKey: ["assets"],
    queryFn: () => listAssets(),
  });

  const parentOptions = allAssets
    .filter((a) => a.id !== excludeId)
    .map((a) => ({ value: a.id, label: a.name }));

  const typeOptions = ASSET_TYPES.map((type) => ({
    value: type,
    label: t(`assets.types.${type}`) as string,
  }));

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <InputController
        name="name"
        control={form.control}
        label={t("assets.fields.name")}
        required
      />

      <SelectController
        name="type"
        control={form.control}
        label={t("assets.fields.type")}
        options={typeOptions}
        required
      />

      <SelectController
        name="parentId"
        control={form.control}
        label={t("assets.fields.parent")}
        options={parentOptions}
        placeholder={t("assets.fields.parentPlaceholder")}
        required
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending
            ? t("common.saving")
            : isEdit
              ? t("common.save")
              : t("common.create")}
        </Button>
      </div>
    </form>
  );
}
