import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('nestora', {
  version: process.env.npm_package_version ?? '0.0.0',
});
