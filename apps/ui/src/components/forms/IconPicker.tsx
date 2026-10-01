import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  OrgAvatar,
  ORG_ICONS,
  ORG_ICON_KEYS,
  type OrgIconKey,
} from "@/components/OrgAvatar";
import { cn } from "@/lib/utils";
import { IconGrid } from "./IconGrid";

const MAX_RAW_LENGTH = 30;

type IconPickerProps = {
  /** Stored icon value: a curated key, an image URL, or free text. */
  value: string | null;
  onChange: (value: string) => void;
  /** Building name — drives the initials fallback in the previews. */
  name?: string | null;
};

/** Picks the building icon: a curated icon, or a raw value (image URL / text
 *  rendered as initials). Renders the current value as an OrgAvatar with a
 *  popover form to change it. */
export const IconPicker: FC<IconPickerProps> = ({ value, onChange, name }) => {
  const { t } = useTranslation("profile");

  const rawLabel = value
    ? value.length > MAX_RAW_LENGTH
      ? `${value.slice(0, MAX_RAW_LENGTH)}…`
      : value
    : t("icon.none");

  return (
    <Popover>
      <div className="flex items-center gap-3">
        <OrgAvatar icon={value} name={name} />
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "truncate text-left text-sm transition-colors hover:text-foreground hover:underline",
              value ? "text-foreground" : "italic text-muted-foreground",
            )}
          >
            {rawLabel}
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" className="w-80">
        <Tabs defaultValue="icon" variant="pill">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="icon">{t("icon.tabIcon")}</TabsTrigger>
            <TabsTrigger value="custom">{t("icon.tabCustom")}</TabsTrigger>
          </TabsList>

          <TabsContent value="icon" className="mt-3">
            <IconGrid
              icons={ORG_ICONS}
              value={
                value && ORG_ICON_KEYS.includes(value)
                  ? (value as OrgIconKey)
                  : null
              }
              onChange={(key) => key && onChange(key)}
            />
          </TabsContent>

          <TabsContent value="custom" className="mt-3 space-y-3">
            <div className="flex justify-center">
              <OrgAvatar icon={value} name={name} size="lg" />
            </div>
            <Input
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("icon.customPlaceholder")}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{t("icon.helper")}</p>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};
