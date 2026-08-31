// Electron 主进程：在本地拉起后端（复用 server/index.ts 的 startServer，零业务改动），
// 创建主窗口 + 常驻浮窗（frameless/transparent/alwaysOnTop）+ 托盘，并桥接浮窗开关 IPC。
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  screen,
  nativeTheme,
  globalShortcut,
  Notification,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const settings = require('./settings.cjs');

const ELECTRON_PORT = Number(process.env.ELECTRON_PORT || 8790);

let mainWin = null;
let floatWin = null;
let tray = null;
let appSettings = null; // 应用设置（预算/透明度/快捷键/位置）

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

// 诊断：抓渲染进程错误/加载失败/崩溃，便于排查 Electron 黑屏（只记录 ERR/WARN 与致命事件，避免刷屏）。
function attachDiag(win, name) {
  const wc = win.webContents;
  wc.on('console-message', (_e, level, message, source, line) => {
    if (level !== 1 && level !== 2) return; // 仅 ERR(1) / WARN(2)
    const tag = level === 1 ? 'ERR' : 'WARN';
    console.log(`[${name} ${tag}] ${message}${source ? ' @ ' + source + ':' + line : ''}`);
  });
  wc.on('did-fail-load', (_e, code, desc, url) => console.log(`[${name} FAIL-LOAD] ${code} ${desc} ${url}`));
  wc.on('render-process-gone', (_e, d) => console.log(`[${name} RENDER-GONE] ${d.reason} exit=${d.exitCode}`));
  wc.on('crashed', () => console.log(`[${name} CRASHED]`));
  wc.on('did-finish-load', () => console.log(`[${name} DID-FINISH-LOAD]`));
}

// 生成桌面快捷方式（.lnk）。便携版无安装程序，需在运行时创建。
// 仅 Windows 有效；用 PowerShell + WScript.Shell COM 写 .lnk，幂等（已存在则覆盖更新）。
// 注意：dev 模式（electron:dev）下 app.getPath('exe') 指向 Electron 运行时二进制而非打包后的
// LLM Workbench.exe，此时生成的 .lnk 会打开裸 Electron 而非工作台 —— 故仅在打包后（app.isPackaged）才创建。
function createDesktopShortcut() {
  if (process.platform !== 'win32') return false;
  if (!app.isPackaged) {
    console.log('[SHORTCUT] skip in dev mode (exe would point to electron runtime, not the app)');
    return false;
  }
  try {
    const exe = app.getPath('exe');
    const exeDir = path.dirname(exe);
    const desktop = app.getPath('desktop');
    const linkPath = path.join(desktop, 'LLM Workbench.lnk');
    const script = `$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut("${linkPath}")
$lnk.TargetPath = "${exe}"
$lnk.WorkingDirectory = "${exeDir}"
$lnk.IconLocation = "${exe},0"
$lnk.Description = "LLM Workbench"
$lnk.Save()`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: 'ignore' }
    );
    console.log(`[SHORTCUT] desktop shortcut -> ${linkPath}`);
    return true;
  } catch (e) {
    console.log(`[SHORTCUT] create failed: ${e && e.message ? e.message : e}`);
    return false;
  }
}

// 依据位置预设计算浮窗坐标（四角 + 边距）
function applyPosition(pos) {
  if (!floatWin) return;
  const { width, height } = floatWin.getBounds();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const m = 12;
  let x = sw - width - m;
  let y = m; // topright（默认）
  if (pos === 'topleft') {
    x = m;
    y = m;
  } else if (pos === 'bottomleft') {
    x = m;
    y = sh - height - m;
  } else if (pos === 'bottomright') {
    x = sw - width - m;
    y = sh - height - m;
  }
  floatWin.setPosition(x, y);
  settings.setBounds(floatWin.getBounds());
}

function positionFloat() {
  applyPosition('topright');
}

// 应用设置：透明度 + 全局快捷键 + 开机自启（位置由 applyPosition / float:snap 单独处理，避免覆盖手动拖拽）
function applySettings() {
  if (!floatWin || !appSettings) return;
  const op = Math.min(1, Math.max(0.4, Number(appSettings.opacity) || 1));
  floatWin.setOpacity(op);
  applyClickThrough();
  registerHotkeys();
  try {
    app.setLoginItemSettings({
      openAtLogin: !!appSettings.openAtLogin,
      path: app.getPath('exe'),
      args: [],
    });
  } catch {
    /* 某些平台/打包形态不支持，静默忽略 */
  }
  // 广播设置变更给浮窗，使其实时刷新外观/穿透状态（无需重载）
  if (floatWin && floatWin.webContents) {
    try {
      floatWin.webContents.send('settings:changed', appSettings);
    } catch {
      /* ignore */
    }
  }
}

// 点击穿透：开启后浮窗忽略鼠标事件（forward 让底层窗口仍可接收），不挡桌面操作
function applyClickThrough() {
  if (!floatWin) return;
  try {
    floatWin.setIgnoreMouseEvents(!!appSettings?.clickThrough, { forward: true });
  } catch {
    /* ignore */
  }
}

function registerHotkeys() {
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* ignore */
  }
  const toggle = appSettings?.hotkeyToggle;
  const cycle = appSettings?.hotkeyCycle;
  const minimal = appSettings?.hotkeyMinimal;
  if (toggle) {
    try {
      globalShortcut.register(toggle, () => {
        if (!floatWin) return;
        floatWin.isVisible() ? floatWin.hide() : floatWin.show();
      });
    } catch {
      /* 快捷键被占用或格式无效，静默忽略 */
    }
  }
  if (cycle) {
    try {
      globalShortcut.register(cycle, () => {
        if (floatWin && floatWin.webContents) floatWin.webContents.send('float:cycle-focus');
      });
    } catch {
      /* ignore */
    }
  }
  if (minimal) {
    try {
      globalShortcut.register(minimal, () => {
        if (floatWin && floatWin.webContents) floatWin.webContents.send('float:toggle-minimal');
      });
    } catch {
      /* 快捷键被占用或格式无效，静默忽略 */
    }
  }
  // 全局 Cmd/Ctrl+K：聚焦主窗口并唤起搜索面板
  try {
    globalShortcut.register('CommandOrControl+K', () => {
      if (!mainWin) return;
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
      mainWin.webContents.send('app:open-search');
    });
  } catch {
    /* ignore */
  }
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
  attachDiag(mainWin, 'MAIN');
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
  // 恢复上次保存的位置/尺寸；无存档则落到设置里的位置预设（默认右上角）
  const saved = settings.getBounds();
  if (saved) floatWin.setBounds(saved);
  else applyPosition(appSettings?.position || 'topright');
  floatWin.on('moved', () => settings.setBounds(floatWin.getBounds()));
  floatWin.on('resized', () => settings.setBounds(floatWin.getBounds()));
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
      label: '切换浮窗点击穿透',
      click: () => floatWin && floatWin.webContents.send('float:toggle-click-through'),
    },
    {
      label: '打开设置',
      click: () => mainWin && mainWin.webContents.send('open-settings'),
    },
    {
      label: '创建桌面快捷方式',
      click: () => createDesktopShortcut(),
    },
    {
      label: '显示今日成本',
      click: () => {
        fetch(`http://127.0.0.1:${ELECTRON_PORT}/api/proxy/metrics/summary`)
          .then((r) => (r.ok ? r.json() : null))
          .then((s) => {
            const cost = s?.todayCostUsd != null ? `$${Number(s.todayCostUsd).toFixed(4)}` : '未知';
            new Notification({ title: '今日成本', body: `本地代理今日成本 ${cost}` });
          })
          .catch(() => new Notification({ title: '今日成本', body: '无法获取代理统计' }));
      },
    },
    {
      label: '重置浮窗位置',
      click: () => {
        if (!floatWin) return;
        applyPosition(appSettings?.position || 'topright');
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
ipcMain.on('app:show', () => mainWin && mainWin.show());
ipcMain.on('float:reset', () => {
  if (!floatWin) return;
  applyPosition(appSettings?.position || 'topright');
});

// 预加载上下文无法稳定拿到 nativeTheme，改由主进程（一定持有）经同步 IPC 回传当前深/浅色。
ipcMain.on('theme:get', (e) => {
  e.returnValue = nativeTheme && nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// 应用设置：读取（同步）/ 保存（保存后应用透明度+快捷键）
ipcMain.on('settings:get', (e) => {
  e.returnValue = appSettings || settings.DEFAULTS;
});
ipcMain.on('settings:save', (_e, obj) => {
  appSettings = { ...(appSettings || settings.DEFAULTS), ...(obj || {}) };
  settings.setAppSettings(appSettings);
  applySettings();
});

// 浮窗吸附到指定角落（位置预设）
ipcMain.on('float:snap', (_e, pos) => {
  appSettings = appSettings || { ...settings.DEFAULTS };
  appSettings.position = pos || 'topright';
  settings.setAppSettings(appSettings);
  applyPosition(appSettings.position);
});

// 浮窗统计持久化：加载（同步回传）/ 保存（落盘到 userData/float-stats.json）
ipcMain.on('stats:load', (e) => {
  e.returnValue = settings.getStats() || null;
});
ipcMain.on('stats:save', (_e, obj) => {
  settings.setStats(obj || {});
});

// 模型深链：浮窗点模型 → 显示主窗口并转发给主窗口渲染进程
ipcMain.on('float:open-model', (_e, model) => {
  if (!mainWin) return;
  if (!mainWin.isVisible()) mainWin.show();
  mainWin.focus();
  mainWin.webContents.send('open-model', model);
});

// 点击穿透开关：翻转后应用并持久化
ipcMain.on('float:toggle-click-through', () => {
  if (!floatWin) return;
  appSettings = appSettings || { ...settings.DEFAULTS };
  appSettings.clickThrough = !appSettings.clickThrough;
  settings.setAppSettings(appSettings);
  applyClickThrough();
  // 广播给浮窗，使其局部状态（指示器/拖拽守卫）与 OS 层保持一致，无需重载
  if (floatWin && floatWin.webContents) {
    try {
      floatWin.webContents.send('settings:changed', appSettings);
    } catch {
      /* ignore */
    }
  }
});

// 双向联动：主窗口点模型 → 转发给浮窗高亮
ipcMain.on('model:highlight', (_e, model) => {
  if (floatWin && floatWin.webContents) floatWin.webContents.send('highlight-model', model);
});

// 主窗口命令：打开设置面板（由托盘或全局快捷键触发）
ipcMain.on('app:open-settings', () => {
  if (mainWin && mainWin.webContents) mainWin.webContents.send('open-settings');
});

// 系统通知（主进程弹原生通知；Windows 需先 setAppUserModelId）
ipcMain.on('app:notify', (_e, { title, body }) => {
  try {
    new Notification({ title: title || 'LLM Workbench', body: body || '' });
  } catch {
    /* 通知不可用时静默 */
  }
});

// 生成桌面快捷方式（按需手动触发，来自设置面板/托盘）
ipcMain.on('app:create-shortcut', () => {
  const ok = createDesktopShortcut();
  if (ok) {
    try {
      new Notification({ title: '桌面快捷方式已创建', body: 'LLM Workbench.lnk 已放到桌面' });
    } catch {
      /* ignore */
    }
  } else {
    try {
      new Notification({ title: '快捷方式创建失败', body: '仅支持 Windows；可手动发送 exe 到桌面' });
    } catch {
      /* ignore */
    }
  }
});

// 系统主题变更 → 广播给各窗口（浮窗据此跟随系统深/浅色）
nativeTheme.on('updated', () => {
  const t = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  if (mainWin && mainWin.webContents) mainWin.webContents.send('theme:change', t);
  if (floatWin && floatWin.webContents) floatWin.webContents.send('theme:change', t);
});

// 单实例锁：防止多次双击启动多个主窗口；重复启动时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });

  app.whenReady().then(async () => {
    settings.setApp(app);
    appSettings = settings.getAppSettings();
    app.setAppUserModelId('com.llmworkbench.app');
    startBackend();
    await waitForBackend();
    createWindows();
    createTray();
    applySettings(); // 应用透明度 + 全局快捷键 + 开机自启
    // 便携版无安装程序：按设置生成桌面快捷方式（打包后每次启动都刷新，确保指向正确的打包 exe）
    if (appSettings?.createDesktopShortcut && app.isPackaged) {
      createDesktopShortcut();
    }
  });
}

// 托盘常驻：所有窗口关闭也不退出
app.on('window-all-closed', () => { /* keep alive in tray */ });
app.on('before-quit', () => {
  app.isQuiting = true;
  try {
    globalShortcut.unregisterAll();
  } catch {
    /* ignore */
  }
});
