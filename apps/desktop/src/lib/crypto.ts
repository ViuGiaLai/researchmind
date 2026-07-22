/**
 * ResearchMind Encryption Engine (E2EE)
 * Uses Web Crypto API for secure in-browser encryption.
 * - Key derivation: PBKDF2 (SHA-256)
 * - Encryption: AES-256-GCM
 *
 * NOTE: The raw master password is NEVER stored. It is kept only in RAM
 * during the active session. Derived keys are used for operations.
 */

// Random salt size
const SALT_SIZE = 16;
// Random initialization vector size for AES-GCM
const IV_SIZE = 12;

/**
 * Derives a cryptographic key from a master password using PBKDF2.
 */
export async function deriveKey(password: string, saltString?: string): Promise<{ key: CryptoKey; salt: string }> {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  let saltBuf: Uint8Array;
  if (saltString) {
    // Decode base64 salt
    const binary = atob(saltString);
    saltBuf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      saltBuf[i] = binary.charCodeAt(i);
    }
  } else {
    // Generate new salt
    saltBuf = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  }

  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuf.buffer as ArrayBuffer,
      iterations: 250000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  // Encode salt to base64 for storage
  const base64Salt = btoa(String.fromCharCode(...saltBuf));
  return { key, salt: base64Salt };
}

/**
 * Encrypts a plaintext string using AES-GCM.
 * Returns the encrypted payload (base64) and the IV used (base64).
 */
export async function encryptData(key: CryptoKey, plaintext: string): Promise<{ payload: string; nonce: string }> {
  const enc = new TextEncoder();
  const ivBuf = window.crypto.getRandomValues(new Uint8Array(IV_SIZE));

  const encryptedBuf = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBuf,
    },
    key,
    enc.encode(plaintext)
  );

  const base64Payload = btoa(String.fromCharCode(...new Uint8Array(encryptedBuf)));
  const base64Nonce = btoa(String.fromCharCode(...ivBuf));

  return { payload: base64Payload, nonce: base64Nonce };
}

/**
 * Decrypts an encrypted payload using AES-GCM.
 */
export async function decryptData(key: CryptoKey, payloadBase64: string, nonceBase64: string): Promise<string> {
  const dec = new TextDecoder();
  
  const payloadBinary = atob(payloadBase64);
  const payloadBuf = new Uint8Array(payloadBinary.length);
  for (let i = 0; i < payloadBinary.length; i++) {
    payloadBuf[i] = payloadBinary.charCodeAt(i);
  }

  const nonceBinary = atob(nonceBase64);
  const nonceBuf = new Uint8Array(nonceBinary.length);
  for (let i = 0; i < nonceBinary.length; i++) {
    nonceBuf[i] = nonceBinary.charCodeAt(i);
  }

  const decryptedBuf = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonceBuf,
    },
    key,
    payloadBuf
  );

  return dec.decode(decryptedBuf);
}

/**
 * In-memory store for the session encryption key.
 * This ensures the key is never written to LocalStorage or Disk.
 */
class SessionKeyManager {
  private currentKey: CryptoKey | null = null;
  private currentSalt: string | null = null;

  setKey(key: CryptoKey, salt: string) {
    this.currentKey = key;
    this.currentSalt = salt;
  }

  getKey(): { key: CryptoKey; salt: string } | null {
    if (!this.currentKey || !this.currentSalt) return null;
    return { key: this.currentKey, salt: this.currentSalt };
  }

  clearKey() {
    this.currentKey = null;
    this.currentSalt = null;
  }
}

export const sessionKeyManager = new SessionKeyManager();
