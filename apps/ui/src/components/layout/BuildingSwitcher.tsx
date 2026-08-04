import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Pencil, PanelsTopLeft } from "lucide-react";
import { OrgAvatar } from "@/components/OrgAvatar";
import { usePermissions } from "@/contexts/AuthContext";
import { useBuildingProfile } from "@/hooks/useBuildingProfile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Building identity block at the top of the sidebar.
 *
 *  The chevron opens an *actions* menu, not a building picker: `BuildingProfile`
 *  is a deployment-wide singleton, so there is nothing to switch between. It is
 *  also the only entry point to the building profile editor.  */
export function BuildingSwitcher() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const can = usePermissions();
  const { data: profile } = useBuildingProfile();

  const name = profile?.name || t("sidebar.building.unnamed");
  const details = [
    profile?.address,
    typeof profile?.floors === "number"
      ? t("sidebar.building.floors", { count: profile.floors })
      : null,
  ].filter(Boolean);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("sidebar.building.actions")}
          className="flex w-full min-w-0 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:bg-accent/60"
        >
          <OrgAvatar icon={profile?.icon} name={profile?.name} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {name}
            </span>
            {details.length > 0 && (
              <span className="truncate text-xs text-muted-foreground">
                {details.join(" · ")}
              </span>
            )}
          </span>
          <ChevronsUpDown
            aria-hidden
            className="h-4 w-4 shrink-0 text-muted-foreground"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="bottom" align="start" className="w-56">
        <DropdownMenuItem onClick={() => navigate("/")}>
          <PanelsTopLeft className="h-4 w-4" />
          {t("sidebar.building.view")}
        </DropdownMenuItem>
        {can("assets:write") && (
          <DropdownMenuItem onClick={() => navigate("/profile/edit")}>
            <Pencil className="h-4 w-4" />
            {t("sidebar.building.edit")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
