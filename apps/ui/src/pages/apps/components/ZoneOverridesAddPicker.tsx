import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import type { Asset } from "@gridone/sdk";
import { Button } from "@/components/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAssetTree } from "@/hooks/useAssetTree";
import { ancestorPathOf } from "@/lib/assets";
import { sortedByName } from "@/lib/sortByName";

interface ZoneOverridesAddPickerProps {
  /** Piloted rooms not yet overridden — the picker's candidate set. */
  zoneIds: string[];
  onAdd: (zoneId: string) => void;
}

/** Searchable picker for adding one room override, mirroring `AssetPicker`'s
 *  Popover+Command shell (outline trigger, searchable list) rather than
 *  requiring the room id to be typed. */
export const ZoneOverridesAddPicker: FC<ZoneOverridesAddPickerProps> = ({
  zoneIds,
  onAdd,
}) => {
  const { t } = useTranslation("apps");
  const { assetsById } = useAssetTree();

  const candidates = sortedByName(
    zoneIds
      .map((zoneId) => assetsById[zoneId])
      .filter((asset): asset is Asset => asset !== undefined),
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t("zoneOverrides.add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder={t("zoneOverrides.searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("zoneOverrides.noneAvailable")}</CommandEmpty>
            <CommandGroup>
              {candidates.map((asset) => (
                <CommandItem
                  key={asset.id}
                  value={`${asset.name} ${ancestorPathOf(asset, assetsById)}`}
                  onSelect={() => onAdd(asset.id)}
                >
                  <span className="flex items-baseline gap-2">
                    <span>{asset.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {ancestorPathOf(asset, assetsById)}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
