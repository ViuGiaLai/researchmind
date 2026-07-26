import { useEffect, useRef } from "react";
import { useActivityStore } from "@/store/activity.store";

export function useActivity() {
  const items = useActivityStore((s) => s.items);
  const loading = useActivityStore((s) => s.loading);
  const error = useActivityStore((s) => s.error);
  const fetchAll = useActivityStore((s) => s.fetchAll);
  const fetched = useRef(false);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      void fetchAll();
    }
  }, [fetchAll]);

  return { activity: items, loading, error, refresh: fetchAll };
}
