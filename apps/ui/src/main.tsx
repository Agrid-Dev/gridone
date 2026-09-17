import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AttributeConfirmationProvider } from "./contexts/AttributeConfirmationContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { GridoneClientProvider } from "./contexts/GridoneClientContext";
import { AuthProvider } from "./contexts/AuthContext";
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
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <GridoneClientProvider>
            <AuthProvider>
              <DeviceProvider>
                <AttributeConfirmationProvider>
                  <App />
                </AttributeConfirmationProvider>
              </DeviceProvider>
            </AuthProvider>
          </GridoneClientProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
