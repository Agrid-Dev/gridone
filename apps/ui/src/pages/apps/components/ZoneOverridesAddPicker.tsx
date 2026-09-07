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
import { ancestorPathOf } from "@/lib/assets";
import { ZoneOverrideRoomOption } from "./ZoneOverrideRoomOption";

interface ZoneOverridesAddPickerProps {
  /** Piloted rooms not yet overridden — the picker's candidate set. */
  candidates: Asset[];
  assetsById: Record<string, Asset>;
  onAdd: (zoneId: string) => void;
  /** Copy overrides for callers other than `zone_overrides` (e.g.
   *  `weekly_schedule`), which reuses this same Popover+Command shell over
   *  a differently-scoped candidate set. Defaults to the zone-overrides
   *  copy so that call site needs no changes. */
  addLabel?: string;
  searchPlaceholder?: string;
  noneAvailableLabel?: string;
}

/** Searchable picker for adding one room override, mirroring `AssetPicker`'s
 *  Popover+Command shell (outline trigger, searchable list) rather than
 *  requiring the room id to be typed. */
export const ZoneOverridesAddPicker: FC<ZoneOverridesAddPickerProps> = ({
  candidates,
  assetsById,
  onAdd,
  addLabel,
  searchPlaceholder,
  noneAvailableLabel,
}) => {
  const { t } = useTranslation("apps");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {addLabel ?? t("zoneOverrides.add")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput
            placeholder={
              searchPlaceholder ?? t("zoneOverrides.searchPlaceholder")
            }
          />
          <CommandList>
            <CommandEmpty>
              {noneAvailableLabel ?? t("zoneOverrides.noneAvailable")}
            </CommandEmpty>
            <CommandGroup>
              {candidates.map((asset) => (
                <CommandItem
                  key={asset.id}
                  value={`${asset.name} ${ancestorPathOf(asset, assetsById)}`}
                  onSelect={() => onAdd(asset.id)}
                >
                  <ZoneOverrideRoomOption
                    asset={asset}
                    assetsById={assetsById}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
