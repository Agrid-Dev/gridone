import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { rememberLoginReturn } from "./lib/loginRedirect";
import { locationUrl } from "./lib/navigation";
import { useNavigationEntries } from "./hooks/useNavigationEntries";
import Apps from "./pages/apps";
import Assets from "./pages/assets";
import Automations from "./pages/automations";
import Dashboards from "./pages/dashboards";
import Devices from "./pages/devices";
import FaultsPage from "./pages/faults/FaultsPage";
import Home from "./pages/home";
import NotificationsPage from "./pages/notifications";
import Drivers from "./pages/drivers";
import Transports from "./pages/transports";
import BuildingProfileEdit from "./pages/building/BuildingProfileEdit";
import LoginPage from "./pages/login/LoginPage";
import UsersPage from "./pages/users/UsersPage";
import SettingsPage from "./pages/settings/SettingsPage";
import Synoptics from "./pages/synoptics";
import { NotFoundFallback } from "./components/fallbacks/NotFound";
import { ShellFrame } from "./components/layout/ShellFrame";
import {
  PageContainer,
  PageLayoutProvider,
} from "./components/layout/PageLayout";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { useAuth } from "./contexts/AuthContext";
import { useBuildingProfile } from "./hooks/useBuildingProfile";
import { useFeatureEnabled } from "./utils/featureFlags";

const SynopticsSandbox = lazy(() => import("./pages/sandbox/SynopticsSandbox"));
const DevicePresentationSandbox = lazy(
  () => import("./pages/sandbox/DevicePresentationSandbox"),
);

function ProtectedLayout() {
  const { t } = useTranslation();
  useNavigationEntries();
  const { data: profile } = useBuildingProfile();
  const sandboxEnabled = useFeatureEnabled("uiSandbox");
  const dashboardsEnabled = useFeatureEnabled("dashboards");
  const synopticsEnabled = useFeatureEnabled("synoptics");

  useEffect(() => {
    document.title = profile?.name ? `${profile.name} | Gridone` : "Gridone";
  }, [profile?.name]);

  return (
    <PageLayoutProvider>
      <div className="min-h-screen bg-background bg-grid">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[60] focus:rounded focus:bg-background focus:p-3 focus:text-primary"
        >
          {t("navigation.skip")}
        </a>
        <ShellFrame>
          <main
            id="main-content"
            tabIndex={-1}
            className="min-w-0 flex-1 scroll-mt-20"
          >
            <PageContainer>
              <Routes>
                <Route index element={<Home />} />
                {dashboardsEnabled && (
                  <Route path="/dashboards/*" element={<Dashboards />} />
                )}
                {synopticsEnabled && (
                  <Route path="/synoptics/*" element={<Synoptics />} />
                )}
                <Route path="/assets/*" element={<Assets />} />
                <Route path="/devices/*" element={<Devices />} />
                <Route path="/drivers/*" element={<Drivers />} />
                <Route path="/transports/*" element={<Transports />} />
                <Route path="/apps/*" element={<Apps />} />
                <Route path="/automations/*" element={<Automations />} />
                <Route path="/faults" element={<FaultsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/profile/edit" element={<BuildingProfileEdit />} />
                <Route path="/settings" element={<SettingsPage />} />
                {sandboxEnabled && (
                  <Route
                    path="/sandbox/synoptics"
                    element={
                      <Suspense>
                        <SynopticsSandbox />
                      </Suspense>
                    }
                  />
                )}
                {sandboxEnabled && (
                  <Route
                    path="/sandbox/device-presentation"
                    element={
                      <Suspense>
                        <DevicePresentationSandbox />
                      </Suspense>
                    }
                  />
                )}
                <Route path="*" element={<NotFoundFallback />} />
              </Routes>
              <Toaster />
            </PageContainer>
          </main>
        </ShellFrame>
      </div>
    </PageLayoutProvider>
  );
}

function LoginRedirect() {
  const location = useLocation();
  useEffect(() => rememberLoginReturn(locationUrl(location)), [location]);
  return <Navigate to="/login" replace />;
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
          <Route path="*" element={<LoginRedirect />} />
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
