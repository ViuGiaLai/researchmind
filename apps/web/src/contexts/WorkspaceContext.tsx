import React, { createContext, useContext, useMemo, useState } from "react";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { Workspace } from "@researchmind/types";

const WorkspaceContext = createContext<{
  workspaces: Workspace[];
  loading: boolean;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  active: Workspace | undefined;
  refresh: () => Promise<void>;
} | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { workspaces, loading, refresh } = useWorkspace();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = workspaces.find((w) => w.id === activeId) || workspaces[0];

  const value = useMemo(
    () => ({
      workspaces,
      loading,
      activeId: active?.id || null,
      setActiveId,
      active,
      refresh,
    }),
    [workspaces, loading, active, refresh],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  return ctx;
}
