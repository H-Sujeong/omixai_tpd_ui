import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "@/api/auth";
import { LoadingBlock } from "@/components/LoadingBlock";

/**
 * Gate for protected routes. Resolves the current session via /auth/me; while
 * loading shows a spinner, on 401 (or any error) redirects to /login carrying
 * the attempted path so login can return there.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isError } = useMe();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingBlock />
      </div>
    );
  }
  if (isError) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}
