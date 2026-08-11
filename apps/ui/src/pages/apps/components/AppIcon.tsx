import { Blocks } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";

const ICON_NAMES = new Set<string>(iconNames);
const ICON_CLASS_NAME = "h-5 w-5";

function FallbackIcon() {
  return <Blocks className={ICON_CLASS_NAME} aria-hidden="true" />;
}

/** Render the Lucide kebab-case icon name declared by an app manifest. */
export function AppIcon({ name }: { name?: string | null }) {
  const iconName = name?.trim();

  if (!iconName || !ICON_NAMES.has(iconName)) {
    return <FallbackIcon />;
  }

  return (
    <DynamicIcon
      name={iconName as IconName}
      className={ICON_CLASS_NAME}
      aria-hidden="true"
      data-icon-name={iconName}
      fallback={FallbackIcon}
    />
  );
}
