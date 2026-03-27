import { Navigate, Route, Routes } from "react-router";
import Apps from "./pages/apps";
import Assets from "./pages/assets";
import Devices from "./pages/devices";
import Transports from "./pages/transports";
import Drivers from "./pages/drivers";
import LoginPage from "./pages/login/LoginPage";
import UsersPage from "./pages/users/UsersPage";
import SettingsPage from "./pages/settings/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { useAuth } from "./contexts/AuthContext";

function ProtectedLayout() {
  return (
    <div className="min-h-screen bg-background bg-grid">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <div className="mx-auto flex max-w-6xl flex-col px-4 pb-10 lg:px-6 pt-10">
          <Routes>
            <Route index element={<Navigate to="/devices" replace />} />
            <Route path="/assets/*" element={<Assets />} />
            <Route path="/devices/*" element={<Devices />} />
            <Route path="/transports/*" element={<Transports />} />
            <Route path="/drivers/*" element={<Drivers />} />
            <Route path="/apps/*" element={<Apps />} />
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
