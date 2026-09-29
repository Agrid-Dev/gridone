import { Navigate, useLocation } from "react-router";

/** `/devices/:id/history` opens on the chart, keeping the query string so a
 *  link carrying a selection or a period still reproduces it. */
export function HistoryIndexRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "chart", search }} replace />;
}
