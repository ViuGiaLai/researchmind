/**
 * Auth helpers — session persistence + cloud profile sync.
 * Prefer `useAuthContext()` for login/register (Clerk like Desktop).
 */
export {
  clearSession,
  ensureWebDevice,
  getStoredUser,
  getToken,
  mapAuthUser,
  persistSession,
  syncCloudProfile,
} from "./auth-session";

/** @deprecated Use useAuthContext().requestPasswordReset */
export async function requestPasswordReset(_email: string): Promise<{ ok: true }> {
  throw new Error("Use useAuthContext().requestPasswordReset instead");
}

/** @deprecated Use useAuthContext().login */
export async function login(_email: string, _password: string): Promise<never> {
  throw new Error("Use useAuthContext().login instead");
}

/** @deprecated Use useAuthContext().register */
export async function register(
  _name: string,
  _email: string,
  _password: string,
): Promise<never> {
  throw new Error("Use useAuthContext().register instead");
}

/** @deprecated Use useAuthContext().logout */
export async function logout(): Promise<void> {
  throw new Error("Use useAuthContext().logout instead");
}
