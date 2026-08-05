import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { OrgAvatar } from "@/components/OrgAvatar";
import { useBuildingProfile } from "@/hooks/useBuildingProfile";

/** Building identity block at the top of the sidebar.
 *
 *  `BuildingProfile` is a deployment-wide singleton, so there is nothing to
 *  switch between: the block is a plain link to the building page, which owns
 *  the profile editor entry point. */
export function BuildingSwitcher() {
  const { t } = useTranslation("common");
  const { data: profile } = useBuildingProfile();

  const name = profile?.name || t("sidebar.building.unnamed");
  const details = [
    profile?.address,
    typeof profile?.floors === "number"
      ? t("sidebar.building.floors", { count: profile.floors })
      : null,
  ].filter(Boolean);

  return (
    <Link
      to="/"
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
    </Link>
  );
}
