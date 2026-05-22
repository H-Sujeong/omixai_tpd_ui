import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import "./styles/main.css";

// Apply saved theme before first paint to avoid flash.
(function initTheme() {
  try {
    const saved = localStorage.getItem("omixai-theme");
    if (saved !== "light") document.documentElement.classList.add("dark");
  } catch {
    document.documentElement.classList.add("dark");
  }
})();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
