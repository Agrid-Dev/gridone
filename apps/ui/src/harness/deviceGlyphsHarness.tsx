// Dev-only harness (committed on purpose): mounts the device glyph sketch
// sheet without the authenticated app shell, so it can be reviewed on any dev
// server. Vite serves it at `/device-glyphs-harness.html`; the production
// build never includes it, since `index.html` is the only build entry.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { TooltipProvider } from "@/components/ui";
import "@/index.css";
import "@/i18n";
import DeviceGlyphsSandbox from "@/pages/sandbox/DeviceGlyphsSandbox";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <main className="min-h-screen bg-background p-8 text-foreground">
          <DeviceGlyphsSandbox />
        </main>
      </TooltipProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
