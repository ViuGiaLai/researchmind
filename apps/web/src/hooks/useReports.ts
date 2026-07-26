import { useEffect, useRef } from "react";
import { useReportStore } from "@/store/report.store";

export function useReports() {
  const items = useReportStore((s) => s.items);
  const loading = useReportStore((s) => s.loading);
  const error = useReportStore((s) => s.error);
  const fetchAll = useReportStore((s) => s.fetchAll);
  const fetched = useRef(false);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      void fetchAll();
    }
  }, [fetchAll]);

  return { reports: items, loading, error, refresh: fetchAll };
}
