import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * apps/desktop's answer to apps/web's httpOnly cookie: a plain JSON file
 * in Electron's own userData directory, read/written only from the main
 * process (never handed to the renderer as a file path, only as values via
 * IPC — see preload/index.ts). A guard kiosk is a physically-secured,
 * single-purpose device, not a general-purpose browser exposed to
 * arbitrary third-party script injection the way apps/web's XSS threat
 * model is — so this doesn't need httpOnly-cookie-grade isolation from the
 * renderer, unlike apps/web. Real PIN/biometric guard auth (§5.3/§1) is
 * its own future session; this just proves the OTP flow and persistence
 * plumbing work end to end.
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  phone: string;
}

export function getSessionPath(userDataDir: string): string {
  return join(userDataDir, 'session.json');
}

export function readSession(path: string): StoredSession | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as StoredSession;
  } catch {
    return null;
  }
}

export function writeSession(path: string, session: StoredSession): void {
  writeFileSync(path, JSON.stringify(session), 'utf8');
}

export function clearSession(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}
