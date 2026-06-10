import { ComponentType } from "react";
import {
  Building,
  Building2,
  Hotel,
  Factory,
  Store,
  Warehouse,
  School,
  Hospital,
  Home,
  Church,
  Castle,
  Landmark,
  Tent,
  Trees,
  Rocket,
  Bone,
  Rabbit,
  PawPrint,
  Cat,
  Dog,
  Turtle,
  Fish,
  Birdhouse,
  Bird,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveOrgAvatar, OrgAvatarContent } from "@/lib/orgAvatar";

type IconComponent = ComponentType<{ className?: string }>;

/** Curated set of org icons the profile may reference, keyed by the string
 *  stored in ``BuildingProfile.icon``. Shared with the profile edit form
 *  (AGR-708) so picker and renderer stay in sync. */
export const ORG_ICONS = {
  building: Building,
  building2: Building2,
  hotel: Hotel,
  factory: Factory,
  store: Store,
  warehouse: Warehouse,
  school: School,
  hospital: Hospital,
  home: Home,
  church: Church,
  castle: Castle,
  landmark: Landmark,
  tent: Tent,
  trees: Trees,
  rocket: Rocket,
  bone: Bone,
  rabbit: Rabbit,
  "paw-print": PawPrint,
  cat: Cat,
  dog: Dog,
  turtle: Turtle,
  fish: Fish,
  birdhouse: Birdhouse,
  bird: Bird,
} as const satisfies Record<string, IconComponent>;

export type OrgIconKey = keyof typeof ORG_ICONS;
export const DEFAULT_ORG_ICON: OrgIconKey = "building2";
export const ORG_ICON_KEYS = Object.keys(ORG_ICONS);

const ICON_KEY_SET = new Set<string>(ORG_ICON_KEYS);

type Size = "sm" | "lg";

const SIZES: Record<Size, { frame: string; icon: string; text: string }> = {
  sm: { frame: "h-9 w-9 rounded-sm", icon: "h-5 w-5", text: "text-xs" },
  lg: { frame: "h-20 w-20 rounded-lg", icon: "h-10 w-10", text: "text-3xl" },
};

/** Square, bordered avatar for the org/building identity — deliberately
 *  squared (GitHub org convention) to contrast the round user avatar. */
export function OrgAvatar({
  icon,
  name,
  size = "sm",
  className,
}: {
  icon?: string | null;
  name?: string | null;
  size?: Size;
  className?: string;
}) {
  const sizing = SIZES[size];
  const content = resolveOrgAvatar(icon, name, ICON_KEY_SET);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-border bg-primary/10 font-display font-semibold leading-none text-primary",
        sizing.frame,
        className,
      )}
    >
      <AvatarContent content={content} sizing={sizing} name={name} />
    </span>
  );
}

function AvatarContent({
  content,
  sizing,
  name,
}: {
  content: OrgAvatarContent;
  sizing: { icon: string; text: string };
  name?: string | null;
}) {
  switch (content.kind) {
    case "icon": {
      const Icon = ORG_ICONS[content.key as OrgIconKey];
      return <Icon className={sizing.icon} />;
    }
    case "image":
      return (
        <img
          src={content.src}
          alt={name ?? ""}
          className="h-full w-full object-cover"
        />
      );
    case "initials":
      return <span className={sizing.text}>{content.text}</span>;
    case "fallback": {
      const Icon = ORG_ICONS[DEFAULT_ORG_ICON];
      return <Icon className={sizing.icon} />;
    }
  }
}
