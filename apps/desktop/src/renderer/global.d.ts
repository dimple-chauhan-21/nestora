import type { StoredSession } from '../main/session-store';

declare global {
  interface Window {
    nestora: {
      version: string;
      session: {
        get(): Promise<StoredSession | null>;
        set(session: StoredSession): Promise<void>;
        clear(): Promise<void>;
      };
    };
  }
}

export {};
