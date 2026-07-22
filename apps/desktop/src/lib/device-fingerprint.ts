/**
 * ResearchMind Device Fingerprint
 *
 * Generates a persistent, anonymous device identifier for the sync engine.
 * Uses browser signals (userAgent, screen, timezone, language) + crypto hash.
 * The fingerprint is stable across sessions but may change if browser/OS changes.
 * Stored in localStorage once generated to maintain consistency.
 *
 * NOTE: This is NOT a security measure — it's for conflict resolution and
 * device identification in the sync engine. Do not use for authentication.
 */

const STORAGE_KEY = "rm_device_fingerprint";

/** Generate a fingerprint from browser signals (without localStorage). */
function generateRawFingerprint(): string {
  const signals = [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.hardwareConcurrency || "unknown",
    // Include canvas fingerprint if available (stable per GPU/driver)
  ];
  return signals.join("|||");
}

/** Simple hash function (djb2) for consistent, fast fingerprinting. */
function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) & 0xffffffff;
  }
  // Convert to hex for readability
  return "fp_" + (hash >>> 0).toString(16).padStart(8, "0");
}

/** Generate or retrieve the cached device fingerprint. */
function getOrCreateFingerprint(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;

    const raw = generateRawFingerprint();
    const fingerprint = hashString(raw);
    localStorage.setItem(STORAGE_KEY, fingerprint);
    return fingerprint;
  } catch {
    // Fallback: random ID (e.g., private browsing where localStorage may fail)
    return "fp_" + Math.random().toString(36).substring(2, 10);
  }
}

/** Cached fingerprint — computed once per session. */
let cachedFingerprint: string | null = null;

/** Get the device fingerprint (cached in-memory after first call). */
export function getDeviceFingerprint(): string {
  if (!cachedFingerprint) {
    cachedFingerprint = getOrCreateFingerprint();
  }
  return cachedFingerprint;
}

/** Clear the stored fingerprint (forces regeneration on next call). */
export function clearDeviceFingerprint(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  cachedFingerprint = null;
}
