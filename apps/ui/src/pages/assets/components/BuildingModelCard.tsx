import { useRef, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Box, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { BuildingModel } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { buildingModelKey, useBuildingModel } from "@/hooks/useBuildingModel";
import { formatTimeAgo } from "@/lib/utils";
import { ImportModelTreeButton } from "./ImportModelTreeButton";
import { EmptySection, SectionHeading } from "./workspaceSections";

type BuildingModelCardProps = {
  assetId: string;
  canWrite: boolean;
};

function formatFileSize(
  bytes: number,
  locale: string,
): { size: string; unit: "mb" | "kb" } {
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1_000_000) {
    return { size: formatter.format(Math.max(bytes, 100) / 1_000), unit: "kb" };
  }
  return { size: formatter.format(bytes / 1_000_000), unit: "mb" };
}

function ModelFacts({ model }: { model: BuildingModel }) {
  const { t, i18n } = useTranslation(["assets", "common"]);
  const { t: tCommon } = useTranslation("common");
  const { size, unit } = formatFileSize(model.ifc_size ?? 0, i18n.language);
  const facts: Array<[string, string]> = [
    [t("editPage.model.fileFact"), model.filename],
    [
      t("editPage.model.sizeFact"),
      t(
        unit === "kb"
          ? "editPage.model.sizeValueKb"
          : "editPage.model.sizeValue",
        { size },
      ),
    ],
    [
      t("editPage.model.contentFact"),
      t("editPage.model.contentValue", {
        floors: model.storeys?.length ?? 0,
        rooms: model.spaces?.length ?? 0,
      }),
    ],
    [
      t("editPage.model.updatedFact"),
      model.updated_at
        ? formatTimeAgo(new Date(model.updated_at).getTime(), tCommon)
        : tCommon("common.unknown"),
    ],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 truncate font-medium text-foreground">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "3D model" card of the building workspace: IFC upload, conversion status,
 * replacement and deletion. Rendered for building assets only.
 */
export function BuildingModelCard({
  assetId,
  canWrite,
}: BuildingModelCardProps) {
  const { t } = useTranslation(["assets", "common"]);
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const { model, isLoading } = useBuildingModel(assetId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      client.assets.uploadModel(assetId, file, file.name),
    onSuccess: (uploaded) => {
      queryClient.setQueryData(buildingModelKey(assetId), uploaded);
      toast.success(t("editPage.model.uploadStarted"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => client.assets.deleteModel(assetId),
    onSuccess: () => {
      queryClient.setQueryData(buildingModelKey(assetId), null);
      toast.success(t("editPage.model.deleted"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    // Reset so picking the same file again re-triggers the change event.
    event.target.value = "";
  };

  const processing = model?.status === "processing";
  const uploadBusy = uploadMutation.isPending || processing;

  return (
    <Card className="flex h-full flex-col rounded-2xl p-6 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          title={t("editPage.model.title")}
          description={t("editPage.model.description")}
        />
        {canWrite && (
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={uploadBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload />
            {model ? t("editPage.model.replace") : t("editPage.model.upload")}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".ifc"
          className="hidden"
          aria-label={t("editPage.model.fileInputLabel")}
          onChange={handleFileChange}
        />
      </div>

      <div className="mt-6 flex-1">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : model === null ? (
          <EmptySection>{t("editPage.model.empty")}</EmptySection>
        ) : processing ? (
          <div className="flex min-h-24 items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t("editPage.model.processing", { filename: model.filename })}
          </div>
        ) : model.status === "failed" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-status-error/30 bg-status-error/10 p-4 text-sm">
              <p className="font-medium text-status-error">
                {t("editPage.model.failed")}
              </p>
              {model.error && (
                <p className="mt-1 text-muted-foreground">{model.error}</p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("editPage.model.failedHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Box className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {t("editPage.model.ready")}
              </p>
            </div>
            <ModelFacts model={model} />
            {(model.spaces?.length ?? 0) === 0 && (
              <p className="text-xs text-status-warning">
                {t("editPage.model.noSpacesNotice")}
              </p>
            )}
          </div>
        )}
      </div>

      {canWrite && model && !processing && (
        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
          {model.status === "ready" && (model.storeys?.length ?? 0) > 0 && (
            <ImportModelTreeButton assetId={assetId} />
          )}
          <ConfirmButton
            type="button"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={deleteMutation.isPending}
            confirmTitle={t("editPage.model.deleteConfirmTitle")}
            confirmDetails={t("editPage.model.deleteConfirmDetails")}
            confirmLabel={t("editPage.model.delete")}
            onConfirm={() => deleteMutation.mutate()}
          >
            <Trash2 />
            {t("editPage.model.delete")}
          </ConfirmButton>
        </div>
      )}
    </Card>
  );
}
