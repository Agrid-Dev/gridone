import { FC } from "react";
import { Navigate, useLocation, useParams } from "react-router";

/** The former chart/table sub-routes collapsed into the single history page.
 *  A component (not a bare <Navigate to="..">) so the query string — period,
 *  metric, page — survives the redirect. */
export const RedirectToHistory: FC = () => {
  const { deviceId } = useParams();
  const { search } = useLocation();
  return (
    <Navigate
      to={{ pathname: `/devices/${deviceId}/history`, search }}
      replace
    />
  );
};
