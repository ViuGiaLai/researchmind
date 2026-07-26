import { formatBytes, generateWorkspaceId } from "@researchmind/utils";

// Lightweight smoke assertions runnable later with vitest
export function runSmoke() {
  if (!formatBytes(1024).includes("KB")) throw new Error("formatBytes failed");
  if (!generateWorkspaceId().startsWith("ws_")) throw new Error("workspace id failed");
  return true;
}
