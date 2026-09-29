import { Outlet, useLocation } from "react-router";
import { ResourceBoundary } from "@/components/ResourceBoundary";

/** Keeps a failure under Configuration inside the section. A query error, a
 *  render crash or a lazy chunk that fails to load after a deploy shows its
 *  fallback below the device header and tabs, so the operator can still move
 *  to another section; the next navigation clears it. */
export default function DeviceConfigLayout() {
  const { pathname } = useLocation();
  return (
    <ResourceBoundary resetKeys={[pathname]}>
      <Outlet />
    </ResourceBoundary>
  );
}
