import { Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DevicesList from "./pages/DevicesList";
import DeviceDetails from "./pages/DeviceDetails";
import { Sidebar } from "./components/Sidebar";

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 lg:px-6">
          <header className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-sm text-slate-600">
                {t("app.description")}
              </p>
            </div>
          </header>

          <Routes>
            <Route index element={<DevicesList />} />
            <Route path="/devices/:deviceId" element={<DeviceDetails />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
