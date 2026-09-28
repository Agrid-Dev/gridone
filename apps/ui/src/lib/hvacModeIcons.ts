import type { LucideIcon } from "lucide-react";
import {
  Droplets,
  Fan,
  Moon,
  RefreshCcwDot,
  Snowflake,
  Sun,
} from "lucide-react";

/** HVAC mode icons, shared by every surface that shows a mode value (attribute
 *  values, device type glyphs) so a mode always looks the same. */
export const HVAC_MODE_ICONS: Record<string, LucideIcon> = {
  heat: Sun,
  cool: Snowflake,
  fan: Fan,
  dry: Droplets,
  auto: RefreshCcwDot,
  idle: Moon,
};
