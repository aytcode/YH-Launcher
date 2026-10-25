const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('yh', {
  platform: process.platform,
  search: (q) => ipcRenderer.invoke('search', q),
  home: () => ipcRenderer.invoke('home'),
  run: (id, mods) => ipcRenderer.invoke('run', id, mods),
  actions: (id) => ipcRenderer.invoke('actions', id),
  action: (id, actionId) => ipcRenderer.invoke('action', id, actionId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  plugins: () => ipcRenderer.invoke('plugins:list'),
  reloadPlugins: () => ipcRenderer.invoke('plugins:reload'),
  openPluginsFolder: () => ipcRenderer.invoke('plugins:folder'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  hide: () => ipcRenderer.send('hide'),
  relaunch: () => ipcRenderer.invoke('relaunch'),
  // Gizliyken görsel/kaynak önbelleğini bırak
  trimMemory: () => webFrame.clearCache(),
  on: (channel, fn) => ipcRenderer.on(channel, (_e, ...args) => fn(...args)),
});
