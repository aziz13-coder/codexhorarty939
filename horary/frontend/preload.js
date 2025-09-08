// Preload: expose API base to the renderer without enabling nodeIntegration
const { contextBridge, ipcRenderer } = require('electron');

const PORT = process.env.HORARY_PORT ? Number(process.env.HORARY_PORT) : 52525;
const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${PORT}`;
const IS_PACKAGED = process.env.APP_IS_PACKAGED === '1' || process.env.NODE_ENV === 'production';

contextBridge.exposeInMainWorld('API_BASE_URL', API_BASE_URL);
contextBridge.exposeInMainWorld('IS_PACKAGED', IS_PACKAGED);

// Expose minimal, promise-based bridge for updates and licensing
contextBridge.exposeInMainWorld('electronAPI', {
  // Updates
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  restartToUpdate: () => ipcRenderer.invoke('update:restart'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (_e, info) => cb && cb(info)),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update:not-available', (_e, info) => cb && cb(info)),
  onUpdateError: (cb) => ipcRenderer.on('update:error', (_e, err) => cb && cb(err)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (_e, p) => cb && cb(p)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', (_e, info) => cb && cb(info)),

  // Licensing
  getLicenseStatus: () => IS_PACKAGED ? ipcRenderer.invoke('license:get-status') : Promise.resolve({ active: true, plan: 'dev' }),
  activateLicense: (payload) => IS_PACKAGED ? ipcRenderer.invoke('license:activate', payload) : Promise.resolve({ ok: true, status: { active: true, plan: 'dev' } }),
  deactivateLicense: () => IS_PACKAGED ? ipcRenderer.invoke('license:deactivate') : Promise.resolve({ ok: true }),
});
