import { useCallback, useState } from "react";
import { copyToClipboard } from "@/utils/clipboard";

export function useClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), resetMs);
    }
    return ok;
  }, [resetMs]);

  return { copied, copy };
}
