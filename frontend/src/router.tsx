import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { PlateListPage } from "@/routes/PlateListPage";
import { DrugSummaryPage } from "@/routes/DrugSummaryPage";
import { DashboardPage } from "@/routes/DashboardPage";
import { GuidePage } from "@/routes/GuidePage";
import { NotFoundPage } from "@/routes/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { index: true, element: <Navigate to="/plates" replace /> },
      { path: "plates", element: <PlateListPage /> },
      { path: "plates/:plateId", element: <DrugSummaryPage /> },
      { path: "plates/:plateId/drugs/:drugId", element: <DashboardPage /> },
      { path: "guide", element: <GuidePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
