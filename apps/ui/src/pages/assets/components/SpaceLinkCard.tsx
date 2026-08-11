import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Box, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import type { Asset, ModelSpace } from "@gridone/sdk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useGridoneClient } from "@/contexts/GridoneClientContext";
import { useBuildingModel } from "@/hooks/useBuildingModel";
import { EmptySection, SectionHeading } from "./workspaceSections";

type SpaceLinkCardProps = {
  asset: Asset;
  allAssets: Asset[];
  canWrite: boolean;
};

/**
 * First ancestor of `asset` (excluding itself) typed `building`, resolved
 * through `path` when populated, otherwise by walking `parent_id` links.
 */
function findAncestorBuilding(asset: Asset, allAssets: Asset[]): Asset | null {
  const byId = new Map(allAssets.map((item) => [item.id, item]));
  const pathIds = (asset.path ?? []).filter((id) => id !== asset.id);
  if (pathIds.length > 0) {
    for (const id of pathIds) {
      const ancestor = byId.get(id);
      if (ancestor?.type === "building") return ancestor;
    }
    return null;
  }
  const seen = new Set<string>([asset.id]);
  let current = asset.parent_id ? byId.get(asset.parent_id) : undefined;
  while (current && !seen.has(current.id)) {
    if (current.type === "building") return current;
    seen.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return null;
}

/**
 * "3D space" card of the room workspace: shows the room's link to a space
 * of the ancestor building's 3D model and lets users link/unlink it.
 * Renders nothing when the building has no ready model.
 */
export function SpaceLinkCard({
  asset,
  allAssets,
  canWrite,
}: SpaceLinkCardProps) {
  const { t } = useTranslation(["assets", "common"]);
  const client = useGridoneClient();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ModelSpace | null>(null);

  const building = useMemo(
    () => findAncestorBuilding(asset, allAssets),
    [asset, allAssets],
  );
  const { model } = useBuildingModel(building?.id);

  const closePicker = () => {
    setPickerOpen(false);
    setSearch("");
    setSelected(null);
  };

  const linkMutation = useMutation({
    mutationFn: (globalId: string) =>
      client.assets.update(asset.id, { ifc_global_id: globalId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("editPage.spaceLink.linked"));
      closePicker();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlinkMutation = useMutation({
    mutationFn: () => client.assets.update(asset.id, { ifc_global_id: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast.success(t("editPage.spaceLink.unlinked"));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const usedGlobalIds = useMemo(
    () =>
      new Set(
        allAssets
          .map((item) => item.ifc_global_id)
          .filter((id): id is string => Boolean(id)),
      ),
    [allAssets],
  );

  const availableSpaces = useMemo(() => {
    const query = search.toLowerCase();
    return (model?.spaces ?? [])
      .filter(
        (space) =>
          !usedGlobalIds.has(space.global_id) &&
          (space.name.toLowerCase().includes(query) ||
            (space.storey_name ?? "").toLowerCase().includes(query)),
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
  }, [model, usedGlobalIds, search]);

  if (!building || !model || model.status !== "ready") {
    return null;
  }

  const linkedSpace = asset.ifc_global_id
    ? (model.spaces ?? []).find(
        (space) => space.global_id === asset.ifc_global_id,
      )
    : undefined;

  return (
    <Card className="flex h-full flex-col rounded-2xl p-6 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          title={t("editPage.spaceLink.title")}
          description={t("editPage.spaceLink.description")}
        />
        {canWrite && !asset.ifc_global_id && (
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => setPickerOpen(true)}
          >
            <Link2 />
            {t("editPage.spaceLink.link")}
          </Button>
        )}
      </div>

      <div className="mt-6 flex-1">
        {asset.ifc_global_id ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Box className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {linkedSpace?.name ?? asset.ifc_global_id}
              </p>
              {linkedSpace?.storey_name && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {linkedSpace.storey_name}
                </p>
              )}
            </div>
            {canWrite && (
              <Button
                type="button"
                variant="ghost"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                disabled={unlinkMutation.isPending}
                onClick={() => unlinkMutation.mutate()}
              >
                <Unlink />
                {t("editPage.spaceLink.unlink")}
              </Button>
            )}
          </div>
        ) : (
          <EmptySection>{t("editPage.spaceLink.empty")}</EmptySection>
        )}
      </div>

      <Dialog
        open={pickerOpen}
        onOpenChange={(next) => {
          if (!next) closePicker();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editPage.spaceLink.pickerTitle")}</DialogTitle>
          </DialogHeader>

          <Input
            placeholder={t("editPage.spaceLink.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-60 overflow-y-auto rounded-md border border-border">
            {availableSpaces.length > 0 ? (
              availableSpaces.map((space) => (
                <button
                  key={space.global_id}
                  type="button"
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted/50 ${
                    selected?.global_id === space.global_id
                      ? "bg-muted font-medium"
                      : ""
                  }`}
                  onClick={() => setSelected(space)}
                >
                  <span className="truncate">{space.name}</span>
                  {space.storey_name && (
                    <span className="truncate text-xs text-muted-foreground">
                      {space.storey_name}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t("common:common.noResults")}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closePicker}>
              {t("common:common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!selected || linkMutation.isPending}
              onClick={() =>
                selected && linkMutation.mutate(selected.global_id)
              }
            >
              {t("editPage.spaceLink.link")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
