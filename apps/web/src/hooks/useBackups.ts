import { useEffect, useRef } from "react";
import { useBackupStore } from "@/store/backup.store";

export function useBackups() {
  const items = useBackupStore((s) => s.items);
  const loading = useBackupStore((s) => s.loading);
  const error = useBackupStore((s) => s.error);
  const fetchAll = useBackupStore((s) => s.fetchAll);
  const create = useBackupStore((s) => s.create);
  const restore = useBackupStore((s) => s.restore);
  const fetched = useRef(false);

  useEffect(() => {
    if (!fetched.current) {
      fetched.current = true;
      void fetchAll();
    }
  }, [fetchAll]);

  return {
    backups: items,
    loading,
    error,
    refresh: fetchAll,
    createBackup: create,
    restoreBackup: restore,
  };
}
