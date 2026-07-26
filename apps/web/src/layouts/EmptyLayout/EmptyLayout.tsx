import React from "react";
import { Outlet } from "react-router-dom";

export function EmptyLayout() {
  return (
    <div className="min-h-screen">
      <Outlet />
    </div>
  );
}
