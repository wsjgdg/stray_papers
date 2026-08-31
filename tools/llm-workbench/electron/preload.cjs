// Electron 预加载脚本：在渲染进程注入 window.electron 桥接 API（contextIsolation 开启下安全暴露）。
const { contextBridge, ipcRenderer, nativeTheme } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  openFloat: () => ipcRenderer.send('float:open'),
  closeFloat: () => ipcRenderer.send('float:close'),
  toggleFloat: () => ipcRenderer.send('float:toggle'),
  hideToTray: () => ipcRenderer.send('app:hide'),
  showMain: () => ipcRenderer.send('app:show'),
  resetFloat: () => ipcRenderer.send('float:reset'),
  getTheme: () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light'),
  onThemeChange: (cb) => ipcRenderer.on('theme:change', (_e, t) => cb(t)),
});
