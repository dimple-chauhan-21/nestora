import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { safeStorage } from 'electron';

/**
 * apps/desktop's answer to apps/web's httpOnly cookie: a file in
 * Electron's own userData directory, read/written only from the main
 * process (never handed to the renderer as a file path, only as values via
 * IPC — see preload/index.ts).
 *
 * The bytes on disk are ciphertext from Electron's safeStorage API, which
 * shells out to the OS's own credential store (macOS Keychain, Windows
 * DPAPI, libsecret on Linux) — not something this code implements itself.
 * A guard kiosk is physically accessible in a way a server never is: a
 * plain JSON file here would hand a full JWT (session hijack until the
 * refresh token's TTL) to anyone who plugs in a USB stick at the gate
 * house. safeStorage is the actual mitigation for that specific threat;
 * the "physically-secured device" framing in earlier revisions of this
 * comment undersold it — physical access to a kiosk is exactly the case
 * that needs defending, not the case that makes it unnecessary.
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  phone: string;
}

export function getSessionPath(userDataDir: string): string {
  return join(userDataDir, 'session.enc');
}

export function readSession(path: string): StoredSession | null {
  if (!existsSync(path)) return null;
  try {
    const ciphertext = readFileSync(path);
    const json = safeStorage.decryptString(ciphertext);
    return JSON.parse(json) as StoredSession;
  } catch {
    return null;
  }
}

export function writeSession(path: string, session: StoredSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // No OS credential store reachable (e.g. a headless/keyring-less Linux
    // box) — refuse to persist rather than silently falling back to
    // plaintext, which would defeat the point of this module entirely.
    // The guard just re-authenticates via OTP next launch.
    throw new Error('safeStorage encryption is not available on this system; refusing to persist session in plaintext');
  }
  const ciphertext = safeStorage.encryptString(JSON.stringify(session));
  writeFileSync(path, ciphertext);
}

export function clearSession(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}
