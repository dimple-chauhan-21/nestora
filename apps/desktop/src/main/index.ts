import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openOfflineQueue, getDefaultQueuePath, enqueue, listUnsynced } from './offline-queue';
import { syncQueue } from './sync';

let queueDb: Database.Database | null = null;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
    },
  });
  win.loadFile(join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
  queueDb = openOfflineQueue(getDefaultQueuePath());
  enqueue(queueDb, 'app.boot', { at: new Date().toISOString() });
  const pending = listUnsynced(queueDb);
  console.log(`[offline-queue] ${pending.length} unsynced operation(s) at boot`);

  // Real guard sessions set these after POST /guard/login; a no-op if
  // there's nothing queued or no session yet. The dashboard poller (started
  // separately, once logged in) is the actual escalation trigger — see
  // dashboard-poller.ts.
  const apiBaseUrl = process.env.NESTORA_API_URL ?? 'http://localhost:4000';
  const accessToken = process.env.NESTORA_GUARD_ACCESS_TOKEN;
  if (accessToken) {
    try {
      const result = await syncQueue(queueDb, { apiBaseUrl, accessToken });
      console.log(`[offline-queue] synced ${result.syncedIds.length} operation(s) at boot`);
      if (result.failedAt) {
        console.log(`[offline-queue] sync stopped at queue id ${result.failedAt}: ${result.error}`);
      }
    } catch (err) {
      console.error('[offline-queue] sync failed', err);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  queueDb?.close();
  if (process.platform !== 'darwin') app.quit();
});
