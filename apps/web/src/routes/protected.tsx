import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { env } from "@/lib/env";
import { Loading } from "@/components/common/Loading";

/**
 * Protect /app/* routes.
 * Requires Clerk (or Firebase) session when VITE_AUTH_REQUIRED=true.
 */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useAuthContext();
  const location = useLocation();

  if (!hydrated) return <Loading label="Checking session…" />;

  if (env.authRequired && !isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

export function useRequireUser() {
  const { user } = useAuthContext();
  return user;
}
