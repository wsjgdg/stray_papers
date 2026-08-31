// Electron 预加载脚本：在渲染进程注入 window.electron 桥接 API（contextIsolation 开启下安全暴露）。
// 注意：预加载上下文里 `require('electron')` 的 `nativeTheme` 在某些环境下为 undefined，
// 因此主题读取改为向主进程同步取（主进程一定持有 nativeTheme），避免崩溃。
const { contextBridge, ipcRenderer } = require('electron');

function readTheme() {
  try {
    const t = ipcRenderer.sendSync('theme:get');
    return t === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  openFloat: () => ipcRenderer.send('float:open'),
  closeFloat: () => ipcRenderer.send('float:close'),
  toggleFloat: () => ipcRenderer.send('float:toggle'),
  hideToTray: () => ipcRenderer.send('app:hide'),
  showMain: () => ipcRenderer.send('app:show'),
  resetFloat: () => ipcRenderer.send('float:reset'),
  getTheme: readTheme,
  onThemeChange: (cb) => ipcRenderer.on('theme:change', (_e, t) => cb(t)),
});
