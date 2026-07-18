import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/**
 * Local SQLite-backed offline queue. Guard-kiosk gate operations (check-in/
 * check-out) write here first when the API is unreachable, and sync to the
 * real gate endpoints on reconnect.
 *
 * `idempotencyKey` is generated at ENQUEUE time, not sync time — a retry
 * after a crash mid-sync reuses the same key rather than minting a new one,
 * so a partial sync followed by a resume never double-logs an entry.
 *
 * `occurredAtClientReported` is the kiosk's own local timestamp at the
 * moment of the action, preserved separately from whatever timestamp the
 * server assigns at sync time — see apps/api's gate_logs migration comment
 * for why both are kept.
 */
export interface QueuedOperation {
  id: number;
  operationType: string;
  payload: string;
  idempotencyKey: string;
  occurredAtClientReported: string;
  createdAt: string;
  syncedAt: string | null;
}

/** Pure, Electron-free — takes an explicit path so it's testable outside a running Electron app. */
export function openOfflineQueue(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      occurred_at_client_reported TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    );
  `);
  return db;
}

/** Real running app only — resolves the default per-user queue file path via Electron's `app` module. Kept separate from openOfflineQueue so tests never need a running Electron instance. */
export function getDefaultQueuePath(): string {
  // Lazy require: importing 'electron' at module load time breaks under
  // plain Node/Jest, where it resolves to a path string instead of the API.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  return join(app.getPath('userData'), 'offline-queue.sqlite');
}

export function enqueue(db: Database.Database, operationType: string, payload: unknown): number {
  const stmt = db.prepare(
    'INSERT INTO offline_queue (operation_type, payload, idempotency_key, occurred_at_client_reported) VALUES (?, ?, ?, ?)',
  );
  const result = stmt.run(
    operationType,
    JSON.stringify(payload),
    randomUUID(),
    new Date().toISOString(),
  );
  return Number(result.lastInsertRowid);
}

export function listUnsynced(db: Database.Database): QueuedOperation[] {
  const rows = db
    .prepare('SELECT * FROM offline_queue WHERE synced_at IS NULL ORDER BY id ASC')
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: r.id as number,
    operationType: r.operation_type as string,
    payload: r.payload as string,
    idempotencyKey: r.idempotency_key as string,
    occurredAtClientReported: r.occurred_at_client_reported as string,
    createdAt: r.created_at as string,
    syncedAt: (r.synced_at as string) ?? null,
  }));
}

export function markSynced(db: Database.Database, id: number): void {
  db.prepare("UPDATE offline_queue SET synced_at = datetime('now') WHERE id = ?").run(id);
}
