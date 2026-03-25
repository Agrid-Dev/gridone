import { Routes, Route } from "react-router";
import { FC } from "react";
import AppsList from "./AppsList";
import AppDetail from "./AppDetail";
import RegistrationRequestsPage from "./RegistrationRequestsPage";

const Apps: FC = () => (
  <Routes>
    <Route index element={<AppsList />} />
    <Route path="requests" element={<RegistrationRequestsPage />} />
    <Route path=":appId" element={<AppDetail />} />
  </Routes>
);

export default Apps;
