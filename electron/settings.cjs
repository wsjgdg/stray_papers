// 浮窗位置/尺寸 + 应用设置持久化：存到 Electron userData 下的 JSON。
const fs = require('node:fs');
const path = require('node:path');

// ── 浮窗位置/尺寸（原逻辑保留）──
const BOUNDS_FILE = 'float-settings.json';
// ── 应用设置（预算/透明度/快捷键/位置等）──
const APP_FILE = 'app-settings.json';
// ── 浮窗统计（Top 模型频次 / 今日成本曲线），跨重载/重启保留 ──
const STATS_FILE = 'float-stats.json';

const DEFAULTS = {
  budgetUsd: 1, // 当日成本告警阈值（USD），0 = 关闭
  opacity: 1, // 浮窗不透明度 0.4–1
  minimalDefault: false, // 浮窗默认极简模式
  hotkeyToggle: 'CommandOrControl+Shift+F', // 开关浮窗
  hotkeyCycle: 'CommandOrControl+Shift+M', // 切换焦点指标
  position: 'topright', // topright|topleft|bottomleft|bottomright
  openAtLogin: false, // 开机自启（系统登录项）
  defaultFocus: 'rate', // 默认焦点指标 rate|cache|cost|model
  refreshMs: 2000, // 浮窗代理统计轮询间隔（毫秒）
  clickThrough: false, // 浮窗点击穿透（不挡桌面）
  fontScale: 1, // 浮窗字号缩放 0.8–1.4
  highContrast: false, // 浮窗高对比模式
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch {
    /* 写入失败静默忽略 */
  }
}

function ensure(file) {
  return path.join(app.getPath('userData'), file);
}
// settings.cjs 被 main.cjs 在 app ready 后调用，此处用闭包保存 app 引用
let appRef = null;
function setApp(app) {
  appRef = app;
}

// ── 浮窗位置/尺寸 ──
function getBounds() {
  if (!appRef) return null;
  const b = readJson(ensure(BOUNDS_FILE), null);
  if (b && typeof b.x === 'number' && typeof b.y === 'number') return b;
  return null;
}
function setBounds(bounds) {
  if (!appRef) return;
  writeJson(ensure(BOUNDS_FILE), bounds);
}

// ── 应用设置 ──
function getAppSettings() {
  if (!appRef) return { ...DEFAULTS };
  const stored = readJson(ensure(APP_FILE), {});
  return { ...DEFAULTS, ...stored };
}
function setAppSettings(obj) {
  if (!appRef) return;
  writeJson(ensure(APP_FILE), obj);
}

// ── 浮窗统计（落盘，避免浮窗重载/应用重启后统计清零）──
function getStats() {
  if (!appRef) return null;
  return readJson(ensure(STATS_FILE), null);
}
function setStats(obj) {
  if (!appRef) return;
  writeJson(ensure(STATS_FILE), obj);
}

module.exports = {
  setApp,
  getBounds,
  setBounds,
  getAppSettings,
  setAppSettings,
  getStats,
  setStats,
  DEFAULTS,
};
