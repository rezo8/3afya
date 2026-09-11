import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "@/router";
import { queryClient } from "@/lib/query/query-client";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/anton";
import "@/styles/theme.css";
import { applyTheme, readTheme } from "@/lib/theme";

// Before the first render, so the chosen palette paints rather than the default.
applyTheme(readTheme());

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
