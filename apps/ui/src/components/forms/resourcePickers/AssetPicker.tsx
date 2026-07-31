import { FC, ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import type { FieldError } from "react-hook-form";
import type { Asset } from "@gridone/sdk";
import { useAssetTree } from "@/hooks/useAssetTree";
import { FieldShell } from "../controllers/FieldShell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CommonProps {
  label?: string;
  description?: string;
  required?: boolean;
  id?: string;
  /** Validation state, when the picker backs a form field. */
  invalid?: boolean;
  error?: FieldError;
}

type AssetPickerProps = CommonProps &
  (
    | {
        multiple: true;
        value: string[];
        onChange: (assetIds: string[]) => void;
      }
    | {
        multiple?: false;
        value: string | undefined;
        onChange: (assetId: string | undefined) => void;
      }
  );

/** Reusable picker over the asset hierarchy — the whole tree, not one asset
 *  type: which level models a "zone" is a deployment choice, so filtering here
 *  would hide legitimate targets. Ancestor names disambiguate same-named rooms.
 *
 *  Multi-select renders a searchable, checkable Popover (mirroring
 *  ``UserPicker``); single-select a plain Select (mirroring ``DevicePicker``). */
export const AssetPicker: FC<AssetPickerProps> = (props) => {
  const { label, description, required, id, invalid, error } = props;
  const { t } = useTranslation("common");
  const reactId = useId();
  const fieldId = id ?? reactId;

  const { assetsList, assetsById, isLoading } = useAssetTree();

  const resolvedLabel = label ?? t("pickers.asset.label");
  const placeholder = t("pickers.asset.placeholder");

  const shell = (children: ReactNode) => (
    <FieldShell
      id={fieldId}
      label={resolvedLabel}
      description={description}
      required={required}
      invalid={invalid}
      error={error}
    >
      {children}
    </FieldShell>
  );

  if (isLoading) return shell(<Skeleton className="h-10 w-full" />);

  if (assetsList.length === 0) {
    return shell(
      <p className="text-sm text-muted-foreground">
        {t("pickers.asset.noAssets")}
      </p>,
    );
  }

  /** "Building A › Floor 1" — the asset's ancestors, itself excluded. */
  const ancestorsOf = (asset: Asset): string =>
    (asset.path ?? [])
      .slice(0, -1)
      .map((ancestorId) => assetsById[ancestorId]?.name)
      .filter(Boolean)
      .join(" › ");

  if (!props.multiple) {
    return shell(
      <Select
        value={props.value ?? ""}
        onValueChange={(assetId) => props.onChange(assetId || undefined)}
      >
        <SelectTrigger id={fieldId}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {assetsList.map((asset) => (
            <SelectItem key={asset.id} value={asset.id}>
              <AssetLabel asset={asset} ancestors={ancestorsOf(asset)} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
  }

  const selected = props.value ?? [];
  const toggle = (assetId: string) =>
    props.onChange(
      selected.includes(assetId)
        ? selected.filter((current) => current !== assetId)
        : [...selected, assetId],
    );

  const summary =
    selected.length === 0
      ? placeholder
      : selected
          .map((assetId) => assetsById[assetId]?.name ?? assetId)
          .join(", ");

  return shell(
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={fieldId}
          type="button"
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(
              "truncate",
              selected.length === 0 && "text-muted-foreground",
            )}
          >
            {summary}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={t("pickers.asset.search")} />
          <CommandList>
            <CommandEmpty>{t("pickers.asset.noAssets")}</CommandEmpty>
            <CommandGroup>
              {assetsList.map((asset) => (
                <CommandItem
                  key={asset.id}
                  value={`${asset.name} ${ancestorsOf(asset)}`}
                  onSelect={() => toggle(asset.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected.includes(asset.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <AssetLabel asset={asset} ancestors={ancestorsOf(asset)} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>,
  );
};

const AssetLabel: FC<{ asset: Asset; ancestors: string }> = ({
  asset,
  ancestors,
}) => (
  <span className="flex items-baseline gap-2">
    <span>{asset.name}</span>
    {ancestors && (
      <span className="truncate text-xs text-muted-foreground">
        {ancestors}
      </span>
    )}
  </span>
);

export default AssetPicker;
