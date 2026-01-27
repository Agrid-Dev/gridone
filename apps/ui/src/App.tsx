import { Route, Routes, Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import Devices from "./pages/devices";
import Transports from "./pages/transports";
import Drivers from "./pages/drivers";
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
              <p className="text-sm text-slate-600">{t("app.description")}</p>
            </div>
          </header>

          <Routes>
            <Route index element={<Navigate to="/devices" replace />} />
            <Route path="/devices/*" element={<Devices />} />
            <Route path="/transports/*" element={<Transports />} />
            <Route path="/drivers/*" element={<Drivers />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
