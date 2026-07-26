import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { Loading } from "@/components/common/Loading";

/** Redirect authenticated users away from auth pages */
export function PublicOnly({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hydrated } = useAuthContext();
  if (!hydrated) return <Loading />;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return <>{children}</>;
}
