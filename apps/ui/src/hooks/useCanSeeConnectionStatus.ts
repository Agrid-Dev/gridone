import { usePermissions } from "@/contexts/AuthContext";

/**
 * Whether the current user sees device connection status. It is technical
 * diagnostics, so only admins see it; `devices:logs:read` is the admin-only
 * permission closest to that audience.
 *
 * Stopgap until per-role attribute access (AGR-1199) projects this server-side.
 */
export function useCanSeeConnectionStatus(): boolean {
  const can = usePermissions();
  return can("devices:logs:read");
}
