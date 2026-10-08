// Dev-only verification harness (committed on purpose): mounts the
// synoptics sandbox — the AHU and extractor units on fixture values —
// without the authenticated app shell, so a browser can screenshot the
// air-handling kit. Vite serves it in development at `/ahu-harness.html`;
// the production build never includes it, since `index.html` is the only
// build entry. `?dark=1&lang=en` as the other harnesses.
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { Toaster } from "sonner";
import "@/index.css";
import i18n from "@/i18n";
import { TooltipProvider } from "@/components/ui";
import SynopticsSandbox from "@/pages/sandbox/SynopticsSandbox";

const params = new URLSearchParams(window.location.search);
if (params.get("dark")) document.documentElement.classList.add("dark");
const lang = params.get("lang");
if (lang) void i18n.changeLanguage(lang);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <TooltipProvider>
        <SynopticsSandbox />
        <Toaster />
      </TooltipProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
