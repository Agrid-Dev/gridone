import type { ReactNode } from "react";
import type { MeResponse } from "@gridone/sdk";
import { usePermissions } from "@/contexts/AuthContext";
import { ForbiddenFallback } from "./fallbacks/Forbidden";

/** Keep a forbidden page unmounted so it cannot query or render cached data. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: MeResponse["permissions"][number];
  children: ReactNode;
}) {
  const can = usePermissions();
  return can(permission) ? children : <ForbiddenFallback />;
}
