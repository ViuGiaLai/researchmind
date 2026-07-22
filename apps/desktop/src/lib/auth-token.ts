/**
 * ResearchMind Auth Token Bridge
 *
 * Module-level singleton to bridge React Auth context to module-level api.ts.
 * The PluggableAuthProvider calls setCurrentToken() on mount/token change,
 * and api.ts calls getCurrentToken() to attach the Bearer header.
 *
 * This avoids having to refactor all of api.ts to use React hooks.
 */

let currentToken: string | null = null;

export function setCurrentToken(token: string | null): void {
  currentToken = token;
}

export function getCurrentToken(): string | null {
  return currentToken;
}
