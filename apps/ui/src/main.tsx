import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { DeviceProvider } from "./contexts/DeviceContext";
import "./index.css";
import "./i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DeviceProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DeviceProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
