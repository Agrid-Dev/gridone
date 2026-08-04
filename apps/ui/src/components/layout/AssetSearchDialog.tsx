import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAssetTree } from "@/hooks/useAssetTree";
import { ancestorPathOf } from "@/lib/assets";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

/** Zone palette. Sole caller of ``useAssetTree`` in the shell: the tree is the
 *  heaviest read in the app and the topbar mounts on every route, so this
 *  component is rendered only once the palette has been opened.
 *
 *  Every asset type is searchable, not just ``type === "zone"`` — which level
 *  models a "zone" is a deployment choice, so filtering here would hide
 *  legitimate results (same rationale as ``AssetPicker``). */
export function AssetSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { assetsList, assetsById, isLoading } = useAssetTree();

  const select = (assetId: string) => {
    onOpenChange(false);
    navigate(`/assets/${assetId}`);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("topbar.search.label")}
      description={t("topbar.search.description")}
    >
      <CommandInput placeholder={t("topbar.search.placeholder")} />
      <CommandList>
        <CommandEmpty>
          {isLoading ? t("topbar.search.loading") : t("topbar.search.empty")}
        </CommandEmpty>
        <CommandGroup>
          {assetsList.map((asset) => {
            const ancestors = ancestorPathOf(asset, assetsById);
            return (
              <CommandItem
                key={asset.id}
                value={`${asset.name} ${ancestors}`}
                onSelect={() => select(asset.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{asset.name}</span>
                  {ancestors && (
                    <span className="truncate text-xs text-muted-foreground">
                      {ancestors}
                    </span>
                  )}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
