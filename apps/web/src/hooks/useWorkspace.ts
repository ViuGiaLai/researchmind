import { useEffect, useRef } from "react";
import { useWorkspaceStore } from "@/store/workspace.store";

export function useWorkspace() {
  const items = useWorkspaceStore((s) => s.items);
  const loading = useWorkspaceStore((s) => s.loading);
  const error = useWorkspaceStore((s) => s.error);
  const fetchAll = useWorkspaceStore((s) => s.fetchAll);
  const fetched = useRef(false);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      void fetchAll();
    }
  }, [fetchAll]);

  return { workspaces: items, loading, error, refresh: fetchAll };
}
