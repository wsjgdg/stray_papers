// Electron 主进程：在本地拉起后端（复用 server/index.ts 的 startServer，零业务改动），
// 创建主窗口 + 常驻浮窗（frameless/transparent/alwaysOnTop）+ 托盘，并桥接浮窗开关 IPC。
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const settings = require('./settings.cjs');

const ELECTRON_PORT = Number(process.env.ELECTRON_PORT || 8790);

let mainWin = null;
let floatWin = null;
let tray = null;

// 在「当前进程」内加载后端（server.cjs 已把自动监听封装为 startServer，且直接运行才自启）。
function startBackend() {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'app')
    : path.resolve(__dirname, '..');
  process.env.API_PORT = String(ELECTRON_PORT);
  process.env.NO_OPEN = '1'; // 不让后端自己打开系统浏览器
  process.env.NO_REUSE = '1'; // 不让后端走「复用已有实例并退出」分支
  process.env.WEB_DIR = path.join(root, 'dist'); // 由我们托管前端，而非内嵌 base64
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startServer } = require('./server.cjs');
  startServer();
}

async function waitForBackend(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${ELECTRON_PORT}/api/health`);
      if (r.ok) return true;
    } catch {
      /* not ready yet */
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  return false;
}

function positionFloat() {
  if (!floatWin) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  floatWin.setPosition(Math.max(0, width - 320), 20);
}

function createWindows() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1626',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadURL(`http://127.0.0.1:${ELECTRON_PORT}/`);
  mainWin.once('ready-to-show', () => mainWin && mainWin.show());
  // 关闭主窗口 → 最小化到托盘，保持浮窗存活（除非真正退出）
  mainWin.on('close', (e) => {
    if (app.isQuiting) return;
    e.preventDefault();
    mainWin.hide();
  });

  floatWin = new BrowserWindow({
    width: 300,
    height: 400,
    minWidth: 220,
    minHeight: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  floatWin.loadURL(`http://127.0.0.1:${ELECTRON_PORT}/float`);
  // 恢复上次保存的位置/尺寸；无存档则落到默认右上角
  const saved = settings.getBounds(app);
  if (saved) floatWin.setBounds(saved);
  else positionFloat();
  floatWin.on('moved', () => settings.setBounds(app, floatWin.getBounds()));
  floatWin.on('resized', () => settings.setBounds(app, floatWin.getBounds()));
  floatWin.on('close', (e) => {
    if (app.isQuiting) return;
    e.preventDefault();
    floatWin.hide();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('LLM Workbench');
  const ctx = Menu.buildFromTemplate([
    { label: '显示工作台', click: () => mainWin && mainWin.show() },
    {
      label: '显示 / 隐藏浮窗',
      click: () => floatWin && (floatWin.isVisible() ? floatWin.hide() : floatWin.show()),
    },
    {
      label: '重置浮窗位置',
      click: () => {
        if (!floatWin) return;
        positionFloat();
        settings.setBounds(app, floatWin.getBounds());
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuiting = true; app.quit(); } },
  ]);
  tray.setContextMenu(ctx);
  tray.on('click', () => {
    if (!mainWin) return;
    mainWin.isVisible() ? mainWin.hide() : mainWin.show();
  });
}

// ── IPC：渲染进程（浮窗按钮 / App 按钮）控制窗口 ──
ipcMain.on('float:open', () => floatWin && floatWin.show());
ipcMain.on('float:close', () => floatWin && floatWin.hide());
ipcMain.on('float:toggle', () => floatWin && (floatWin.isVisible() ? floatWin.hide() : floatWin.show()));
ipcMain.on('app:hide', () => mainWin && mainWin.hide());

app.whenReady().then(async () => {
  startBackend();
  await waitForBackend();
  createWindows();
  createTray();
});

// 托盘常驻：所有窗口关闭也不退出
app.on('window-all-closed', () => { /* keep alive in tray */ });
app.on('before-quit', () => { app.isQuiting = true; });
