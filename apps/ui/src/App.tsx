import { Navigate, Route, Routes } from "react-router";
import Apps from "./pages/apps";
import Assets from "./pages/assets";
import Automations from "./pages/automations";
import Devices from "./pages/devices";
import FaultsPage from "./pages/faults/FaultsPage";
import NotificationsPage from "./pages/notifications";
import Drivers from "./pages/drivers";
import LoginPage from "./pages/login/LoginPage";
import UsersPage from "./pages/users/UsersPage";
import SettingsPage from "./pages/settings/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { useAuth } from "./contexts/AuthContext";

function ProtectedLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-64 flex min-h-screen flex-col">
        <TopBar />
        <main className="flex-1">
          <div className="mx-auto flex max-w-7xl flex-col px-6 py-8 lg:px-8">
            <Routes>
              <Route index element={<Navigate to="/devices" replace />} />
              <Route path="/assets/*" element={<Assets />} />
              <Route path="/devices/*" element={<Devices />} />
              <Route path="/drivers/*" element={<Drivers />} />
              <Route path="/apps/*" element={<Apps />} />
              <Route path="/automations/*" element={<Automations />} />
              <Route path="/faults" element={<FaultsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
            <Toaster />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="font-display text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
            Loading
          </p>
        </div>
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

  return (
    <TooltipProvider>
      <ProtectedLayout />
    </TooltipProvider>
  );
}
