import { env } from "./env";

export const clerkPublishableKey = env.clerkKey;
export const clerkConfigured = Boolean(clerkPublishableKey);

export function clerkErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      errors?: Array<{ longMessage?: string; message?: string }>;
      message?: string;
    };
    if (e.errors?.[0]?.longMessage) return e.errors[0].longMessage;
    if (e.errors?.[0]?.message) return e.errors[0].message;
    if (e.message) return e.message;
  }
  if (err instanceof Error) return err.message;
  return "Authentication failed";
}
