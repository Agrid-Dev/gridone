import { FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ZoneOverrideRoomOption } from "./ZoneOverrideRoomOption";

interface ZoneOverrideCopyPickerProps {
  /** Piloted rooms not yet overridden — the picker's candidate set, shared
   *  (and computed once) across every row's picker. */
  candidates: Asset[];
  assetsById: Record<string, Asset>;
  onCopy: (targetZoneIds: string[]) => void;
}

/** Row action copying one override's values to several other rooms at once.
 *  Mirrors `ZoneOverridesAddPicker`'s Popover+Command shell, but multi-select
 *  (checkable, like `AssetPicker`'s multi-select branch) with an explicit
 *  confirm — copying several rooms in one step is the point, so selecting a
 *  target can't close the picker the way picking one does for "Add". */
export const ZoneOverrideCopyPicker: FC<ZoneOverrideCopyPickerProps> = ({
  candidates,
  assetsById,
  onCopy,
}) => {
  const { t } = useTranslation("apps");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (zoneId: string) =>
    setSelected((current) =>
      current.includes(zoneId)
        ? current.filter((id) => id !== zoneId)
        : [...current, zoneId],
    );

  const confirm = () => {
    onCopy(selected);
    setSelected([]);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSelected([]);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("zoneOverrides.copy")}
        >
          <Copy className="h-4 w-4" />
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
                  onSelect={() => toggle(asset.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected.includes(asset.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <ZoneOverrideRoomOption
                    asset={asset}
                    assetsById={assetsById}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-2">
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={selected.length === 0}
            onClick={confirm}
          >
            {t("zoneOverrides.copyConfirm", { count: selected.length })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
