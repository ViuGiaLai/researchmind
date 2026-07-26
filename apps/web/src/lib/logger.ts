import { env } from "./env";

type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, message: string, meta?: unknown) {
  if (!env.isDev && level === "debug") return;
  const payload = meta === undefined ? [message] : [message, meta];
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](`[RM]`, ...payload);
}

export const logger = {
  debug: (m: string, meta?: unknown) => log("debug", m, meta),
  info: (m: string, meta?: unknown) => log("info", m, meta),
  warn: (m: string, meta?: unknown) => log("warn", m, meta),
  error: (m: string, meta?: unknown) => log("error", m, meta),
};
