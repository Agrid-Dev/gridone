import { Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import Assets from "./pages/assets";
import Devices from "./pages/devices";
import Transports from "./pages/transports";
import Drivers from "./pages/drivers";
import LoginPage from "./pages/login/LoginPage";
import UsersPage from "./pages/users/UsersPage";
import SettingsPage from "./pages/settings/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/ui/sonner";
import { useAuth } from "./contexts/AuthContext";

function ProtectedLayout() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <div className="mx-auto flex max-w-6xl flex-col mt-4 px-4 pb-10 lg:px-6">
          <header className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm mb-8">
            <div>
              <p className="text-sm text-slate-600">{t("app.description")}</p>
            </div>
          </header>

          <Routes>
            <Route index element={<Navigate to="/devices" replace />} />
            <Route path="/assets/*" element={<Assets />} />
            <Route path="/devices/*" element={<Devices />} />
            <Route path="/transports/*" element={<Transports />} />
            <Route path="/drivers/*" element={<Drivers />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          <Toaster />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster />
      </>
    );
  }

  return <ProtectedLayout />;
}
