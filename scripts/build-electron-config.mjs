// 生成 electron/build-config.json：允许在「构建」阶段通过环境变量决定
// 桌面快捷方式 / 开机自启 的默认行为。该文件被 settings.cjs 在运行时读取并合并进默认值，
// 因此便携版（无安装程序）双击启动时即可按构建期开关表现，而不仅是用户手动设置。
// 文件 gitignored，不入库；每次构建由本脚本按当前环境变量重新生成。
//
// 用法：
//   LLMWB_DESKTOP_SHORTCUT=1 LLMWB_AUTOSTART=0 npm run electron:build:portable
//   LLMWB_AUTOSTART=1 npm run electron:build        # 默认开启开机自启
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const onOff = (v, dflt) => {
  const raw = process.env[v];
  if (raw === undefined) return dflt;
  return raw !== '0' && raw.toLowerCase() !== 'false';
};

const cfg = {
  // 桌面快捷方式：默认开启（便携版首次启动在运行时创建 .lnk）
  createDesktopShortcut: onOff('LLMWB_DESKTOP_SHORTCUT', true),
  // 开机自启：默认关闭（用户可在设置面板切换，或构建时 LLMWB_AUTOSTART=1 打开）
  openAtLogin: onOff('LLMWB_AUTOSTART', false),
};

const out = path.join(root, 'electron', 'build-config.json');
writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
console.log(`[build-electron-config] wrote ${out}:`, cfg);
