/**
 * Cloud Platform env — Web talks to shared Cloudflare Pages Functions API.
 * Auth: prefer Clerk (same as Desktop) when VITE_CLERK_PUBLISHABLE_KEY is set;
 * Firebase remains available as fallback.
 */
export const env = {
  appName: import.meta.env.VITE_APP_NAME || "ResearchMind Cloud",
  cloudApiBaseUrl: (
    import.meta.env.VITE_CLOUD_API_BASE_URL ||
    import.meta.env.VITE_GATEWAY_URL ||
    "https://researchmind.pages.dev/api/v1"
  ).replace(/\/$/, ""),
  cloudSyncUrl: (import.meta.env.VITE_CLOUD_SYNC_URL || "").replace(/\/$/, ""),
  /** @deprecated Web Cloud Platform does not call local FastAPI */
  apiBaseUrl: (
    import.meta.env.VITE_API_BASE_URL || "https://researchmind.pages.dev/api/v1"
  ).replace(/\/$/, ""),
  clerkKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "",
  gatewaySharedToken:
    import.meta.env.VITE_GATEWAY_SHARED_TOKEN ||
    import.meta.env.VITE_VITE_GATEWAY_SHARED_TOKEN ||
    "",
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
  },
  authRequired:
    String(import.meta.env.VITE_AUTH_REQUIRED ?? "true").toLowerCase() !== "false" &&
    String(import.meta.env.VITE_AUTH_REQUIRED) !== "0",
  defaultLocale: (import.meta.env.VITE_DEFAULT_LOCALE || "en") as "en" | "vi",
  isDev: import.meta.env.DEV,
};

export const firebaseConfigured = Boolean(
  env.firebase.apiKey && env.firebase.authDomain && env.firebase.projectId,
);

export const clerkConfigured = Boolean(env.clerkKey);
