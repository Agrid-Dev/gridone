// Dev-only harness (committed on purpose): mounts the device fleet card sheet
// without the authenticated app shell, so it can be reviewed on any dev
// server. Vite serves it at `/device-glyphs-harness.html`; the production
// build never includes it, since `index.html` is the only build entry. The
// fake client signs in an admin, so the cards show their connection dot.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { TooltipProvider } from "@/components/ui";
import { AuthProvider } from "@/contexts/AuthContext";
import { GridoneClientProvider } from "@/contexts/GridoneClientContext";
import "@/index.css";
import "@/i18n";
import DeviceGlyphsSandbox from "@/pages/sandbox/DeviceGlyphsSandbox";

const client = {
  me: async () => ({
    id: "u",
    email: "harness@example.com",
    permissions: ["devices:read", "devices:logs:read"],
  }),
  health: async () => ({ status: "ok" }),
  logout: async () => {},
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <GridoneClientProvider client={client as never}>
      <AuthProvider>
        <BrowserRouter>
          <TooltipProvider>
            <main className="min-h-screen bg-background p-8 text-foreground">
              <DeviceGlyphsSandbox />
            </main>
          </TooltipProvider>
        </BrowserRouter>
      </AuthProvider>
    </GridoneClientProvider>
  </React.StrictMode>,
);
