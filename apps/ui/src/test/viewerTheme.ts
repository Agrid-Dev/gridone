import type { ViewerTheme } from "@/components/three/themeColors";

/**
 * A resolved viewer palette for specs. Lives here so adding a stage colour
 * does not mean editing every 3D component spec.
 */
export const viewerThemeFixture: ViewerTheme = {
  isDark: false,
  cool: [217, 91, 60],
  ok: [142, 76, 36],
  heat: [25, 95, 53],
  error: [0, 72, 51],
  stage: {
    gridCell: "#e7ded6",
    gridSection: "#d2c3b6",
    slab: "#b0a094",
    structure: "#8b7777",
    envelope: "#9fadbd",
    fog: "#e9dfd5",
  },
};
