import { FC } from "react";
import { Route, Routes } from "react-router";
import { RequirePermission } from "@/components/RequirePermission";
import { NotFoundFallback } from "@/components/fallbacks/NotFound";
import FaultsPage from "./FaultsPage";
import FaultHistoryPage from "./history/FaultHistoryPage";

/** Alerts: those ongoing, and their history over a period. The history is
 *  rebuilt from the devices' recorded series, hence its permission. */
const Faults: FC = () => (
  <Routes>
    <Route index element={<FaultsPage />} />
    <Route
      path="history"
      element={
        <RequirePermission permission="timeseries:read">
          <FaultHistoryPage />
        </RequirePermission>
      }
    />
    <Route path="*" element={<NotFoundFallback />} />
  </Routes>
);

export default Faults;
