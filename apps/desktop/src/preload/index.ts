import { contextBridge, ipcRenderer } from 'electron';
import type { StoredSession } from '../main/session-store';

contextBridge.exposeInMainWorld('nestora', {
  version: process.env.npm_package_version ?? '0.0.0',
  session: {
    get: (): Promise<StoredSession | null> => ipcRenderer.invoke('session:get'),
    set: (session: StoredSession): Promise<void> => ipcRenderer.invoke('session:set', session),
    clear: (): Promise<void> => ipcRenderer.invoke('session:clear'),
  },
});
