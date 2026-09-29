import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { OrgAvatar } from "@/components/OrgAvatar";
import { useBuildingProfile } from "@/hooks/useBuildingProfile";

/** Building identity header at the top of the sidebar.
 *
 *  `BuildingProfile` is a deployment-wide singleton, so there is nothing to
 *  switch between: the block is a plain link to the building page, which owns
 *  the profile editor entry point. It is drawn as a header rather than a
 *  card — no frame, no fill, no chevron — because a bordered block with a
 *  hover fill promises a menu that never opens. The only hover cue is the
 *  name taking the link colour. */
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
      className="group flex h-full w-full min-w-0 items-center gap-3 px-4 text-left"
    >
      <OrgAvatar icon={profile?.icon} name={profile?.name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-display text-base font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
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
