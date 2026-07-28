import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { openOfflineQueue, getDefaultQueuePath, enqueue, listUnsynced } from './offline-queue';
import { syncQueue } from './sync';
import { getSessionPath, readSession, writeSession, clearSession, type StoredSession } from './session-store';

let queueDb: Database.Database | null = null;

function registerSessionIpc(): void {
  const sessionPath = getSessionPath(app.getPath('userData'));
  ipcMain.handle('session:get', () => readSession(sessionPath));
  ipcMain.handle('session:set', (_event, session: StoredSession) => writeSession(sessionPath, session));
  ipcMain.handle('session:clear', () => clearSession(sessionPath));
}

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
  registerSessionIpc();

  queueDb = openOfflineQueue(getDefaultQueuePath());
  enqueue(queueDb, 'app.boot', { at: new Date().toISOString() });
  const pending = listUnsynced(queueDb);
  console.log(`[offline-queue] ${pending.length} unsynced operation(s) at boot`);

  // Real guard sessions set these after POST /guard/login; a no-op if
  // there's nothing queued or no session yet. The real escalation trigger
  // is the renderer's own GET /guard/dashboard poll (React Query,
  // refetchInterval — see guard-console.tsx), same as the resident
  // dashboard's poll in apps/web. An earlier main-process poller
  // (dashboard-poller.ts) predated any real login flow and only ever
  // logged to the console, not the renderer — removed once the renderer
  // had a real one to avoid two competing "the real trigger" stories.
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
