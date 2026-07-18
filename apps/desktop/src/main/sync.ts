import type Database from 'better-sqlite3';
import { listUnsynced, markSynced } from './offline-queue';

export interface SyncConfig {
  apiBaseUrl: string;
  accessToken: string;
}

export interface SyncResult {
  syncedIds: number[];
  /** id of the first queued item that failed — sync stops there so items are always applied in original local order, never out of order. */
  failedAt: number | null;
  error?: string;
}

function operationEndpoint(operationType: string): string | null {
  switch (operationType) {
    case 'gate.scan':
      return '/api/v1/gate/scan';
    case 'gate.manual-entry':
      return '/api/v1/gate/manual-entry';
    default:
      return null;
  }
}

/**
 * Syncs queued offline operations to the real API, strictly in original
 * local (enqueue) order. Each request carries the idempotency_key generated
 * at enqueue time (as `idempotencyKey` in the body — GateScanDto/
 * GateManualEntryDto both accept it) plus `occurredAtClientReported`, so a
 * retry after a partial sync (e.g. the app crashes mid-loop) reuses the same
 * key and the server's unique constraint on it makes the re-POST a no-op
 * (returns the original row) rather than double-logging.
 *
 * Stops at the first failure — a network error (still offline) or an API
 * rejection — rather than skipping ahead, so later items are never applied
 * before earlier ones.
 */
export async function syncQueue(db: Database.Database, config: SyncConfig): Promise<SyncResult> {
  const pending = listUnsynced(db);
  const syncedIds: number[] = [];

  for (const op of pending) {
    const endpoint = operationEndpoint(op.operationType);
    if (!endpoint) {
      // Unknown operation type — shouldn't happen, but don't block the rest
      // of the queue on a row that was never going to sync anyway.
      markSynced(db, op.id);
      continue;
    }

    const payload = JSON.parse(op.payload) as Record<string, unknown>;
    const body = {
      ...payload,
      idempotencyKey: op.idempotencyKey,
      occurredAtClientReported: op.occurredAtClientReported,
    };

    let response: Response;
    try {
      response = await fetch(`${config.apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return {
        syncedIds,
        failedAt: op.id,
        error: err instanceof Error ? err.message : 'network error (still offline)',
      };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { syncedIds, failedAt: op.id, error: `HTTP ${response.status}: ${text}` };
    }

    markSynced(db, op.id);
    syncedIds.push(op.id);
  }

  return { syncedIds, failedAt: null };
}
