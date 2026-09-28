import { Route } from "react-router";
import DeviceHistoryPage from "./DeviceHistoryPage";
import { HistoryChartCard } from "./HistoryChartCard";
import { HistoryIndexRedirect } from "./HistoryIndexRedirect";
import HistoryTable from "./HistoryTable";

/** The history routes under a device: the layout carrying the selection and
 *  the period, and the two views it switches between. */
export const deviceHistoryRoutes = (
  <Route path="history" element={<DeviceHistoryPage />}>
    <Route index element={<HistoryIndexRedirect />} />
    <Route path="chart" element={<HistoryChartCard />} />
    <Route path="table" element={<HistoryTable />} />
  </Route>
);
