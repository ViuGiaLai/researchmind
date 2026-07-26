import { logger } from "./logger";

export function track(event: string, props?: Record<string, unknown>) {
  logger.debug(`analytics:${event}`, props);
  // Plausible / custom analytics hook point
  if (typeof window !== "undefined" && (window as any).plausible) {
    (window as any).plausible(event, { props });
  }
}
