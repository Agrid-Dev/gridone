import { Routes, Route } from "react-router";
import { FC } from "react";
import DevicesList from "./DevicesList";
import Device from "./device";

const Devices: FC = () => (
  <Routes>
    <Route index element={<DevicesList />} />
    <Route path="*" element={<Device />} />
  </Routes>
);

export default Devices;
