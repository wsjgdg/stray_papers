// 验证 Electron 打包流水线在「electron-builder 实际打包」之前的所有前置步骤正确产出：
// 1. build:server:electron —— esbuild 把后端打进 electron/server.cjs（自包含、运行时不依赖 node_modules）
// 2. make:icon            —— 生成 electron/icon.png，且必须是 512x512（nsis 安装包要求 >=256，否则 electron-builder 失败）
// 3. build:electron-config—— 生成 electron/build-config.json（运行时读取的构建期开关）
// 不触发 electron-builder 本身（沙箱 winCodeSign 软链限制），但覆盖其全部前置依赖，确保用户机 `electron:build:portable` 能顺利走到打包步。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`);
  }
}
function run(script) {
  try {
    execFileSync('npm', ['run', script], { cwd: ROOT, stdio: 'ignore', shell: true });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

// 1) 后端 bundle
const code1 = run('build:server:electron');
check('build:server:electron exit 0', code1 === 0, `exit=${code1}`);
const serverCjs = path.join(ROOT, 'electron', 'server.cjs');
const serverOk = fs.existsSync(serverCjs) && fs.statSync(serverCjs).size > 1_000_000;
check('electron/server.cjs exists & >1MB (bundled)', serverOk, serverOk ? `${fs.statSync(serverCjs).size} bytes` : 'missing');

// 2) 图标
const code2 = run('make:icon');
check('make:icon exit 0', code2 === 0, `exit=${code2}`);
const icon = path.join(ROOT, 'electron', 'icon.png');
let iconOk = false;
let iconDim = '';
if (fs.existsSync(icon)) {
  const buf = fs.readFileSync(icon);
  const sig = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  iconDim = `${w}x${h}`;
  iconOk = sig && w === 512 && h === 512;
}
check('electron/icon.png is 512x512 PNG', iconOk, iconDim);

// 3) 构建期配置
const code3 = run('build:electron-config');
check('build:electron-config exit 0', code3 === 0, `exit=${code3}`);
const cfgPath = path.join(ROOT, 'electron', 'build-config.json');
let cfgOk = false;
let cfgFields = '';
if (fs.existsSync(cfgPath)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    cfgOk = typeof cfg.createDesktopShortcut === 'boolean' && typeof cfg.openAtLogin === 'boolean';
    cfgFields = `createDesktopShortcut=${cfg.createDesktopShortcut}, openAtLogin=${cfg.openAtLogin}`;
  } catch {
    /* parse error */
  }
}
check('electron/build-config.json valid with boolean switches', cfgOk, cfgFields);

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
