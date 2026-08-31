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
  // 应用设置：读取（同步）/ 保存
  getSettings: () => {
    try {
      return ipcRenderer.sendSync('settings:get');
    } catch {
      return null;
    }
  },
  saveSettings: (obj) => ipcRenderer.send('settings:save', obj),
  // 系统通知（主进程弹原生通知）
  notify: (title, body) => ipcRenderer.send('app:notify', { title, body }),
  // 浮窗内部命令：由主进程全局快捷键转发
  onToggleMinimal: (cb) => ipcRenderer.on('float:toggle-minimal', () => cb()),
  onCycleFocus: (cb) => ipcRenderer.on('float:cycle-focus', () => cb()),
  // 浮窗吸附到指定角落（位置预设）
  snapFloat: (pos) => ipcRenderer.send('float:snap', pos),
  // 模型深链：浮窗点模型 → 主进程转发给主窗口
  openModel: (model) => ipcRenderer.send('float:open-model', model),
  onOpenModel: (cb) => ipcRenderer.on('open-model', (_e, m) => cb(m)),
  // 浮窗统计持久化（仅 Electron 内有效）：加载（同步）/ 保存
  loadStats: () => {
    try {
      return ipcRenderer.sendSync('stats:load');
    } catch {
      return null;
    }
  },
  saveStats: (obj) => ipcRenderer.send('stats:save', obj),
});
