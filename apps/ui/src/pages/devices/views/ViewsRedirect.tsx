import { Navigate, useLocation, useParams } from "react-router";

/** The group forms live in Configuration › Groups now. An old link still
 *  lands on the same form, with its query string (`?advanced=1`, the
 *  pre-checked `device_id`s). */
export function ViewsRedirect() {
  const { viewId } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={{
        pathname: viewId ? `/groups/${viewId}/edit` : "/groups/new",
        search,
      }}
      replace
    />
  );
}
