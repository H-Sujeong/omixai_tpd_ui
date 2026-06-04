import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginPage } from "@/routes/LoginPage";
import { PlateListPage } from "@/routes/PlateListPage";
import { DrugSummaryPage } from "@/routes/DrugSummaryPage";
import { DashboardPage } from "@/routes/DashboardPage";
import { GuidePage } from "@/routes/GuidePage";
import { AdminPage } from "@/routes/AdminPage";
import { NotFoundPage } from "@/routes/NotFoundPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell>
          <Outlet />
        </AppShell>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/plates" replace /> },
      { path: "plates", element: <PlateListPage /> },
      { path: "plates/:plateId", element: <DrugSummaryPage /> },
      { path: "plates/:plateId/drugs/:drugId", element: <DashboardPage /> },
      { path: "guide", element: <GuidePage /> },
      { path: "admin", element: <AdminPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
