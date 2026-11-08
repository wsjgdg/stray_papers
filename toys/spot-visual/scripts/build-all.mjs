#!/usr/bin/env node
/**
 * 一键构建：依赖检查 → 类型检查 → Next 构建（含图片清单与 sharecode 注入）
 *
 * 用法（Windows / PowerShell / Git Bash / CI 都适用）：
 *   node scripts/build-all.mjs            # 完整构建
 *   node scripts/build-all.mjs --skip-install   # 跳过依赖检查
 *   node scripts/build-all.mjs --no-tsc         # 跳过类型检查（不推荐）
 *
 * Windows 上也可以直接双击 build.cmd
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const argv = process.argv.slice(2);
const skipInstall = argv.includes('--skip-install');
const skipTsc = argv.includes('--no-tsc');

const STEP = (n) => `\n\u001b[36m[${n}]\u001b[0m`;
let failed = null;

function run(label, cmd, args, opts = {}) {
  const t0 = Date.now();
  process.stdout.write(`${STEP(label)} ${cmd} ${args.join(' ')}\n`);
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  const ms = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.status !== 0) {
    failed = label;
    console.error(`\u001b[31m✗ ${label} 失败（${ms}s，退出码 ${r.status}）\u001b[0m`);
    return false;
  }
  console.log(`\u001b[32m✓ ${label} 通过（${ms}s）\u001b[0m`);
  return true;
}

console.log('=== spot-visual 构建 ===');
console.log(`node ${process.version} / ${process.platform}`);

// 1) 依赖
if (!skipInstall) {
  const needInstall = !existsSync('node_modules') || !existsSync('node_modules/next');
  if (needInstall) {
    const hasLock = existsSync('package-lock.json');
    if (!run('依赖安装', 'npm', [hasLock ? 'ci' : 'install'])) process.exit(1);
  } else {
    console.log(`${STEP('依赖安装')} node_modules 已存在，跳过（需要重装用 npm ci）`);
  }
}

// 2) 类型检查
// 默认「报警告但继续」：部署走的是 next build（本身不因 TS 错误失败），
// 并行开发时别的模块半成品不该挡住整包构建。加 --strict 才把类型错误当失败。
if (!skipTsc) {
  const okTsc = run('类型检查', 'npx', ['tsc', '--noEmit']);
  const strict = argv.includes('--strict');
  if (!okTsc) {
    if (strict) {
      console.error('\u001b[31m类型检查失败且指定了 --strict，终止。\u001b[0m');
      process.exit(1);
    }
    console.warn('\u001b[33m⚠ 类型检查有问题，继续构建（加 --strict 可让其阻塞）\u001b[0m');
  }
}

// 3) 构建（next build + 图片清单 + sharecode 注入）
if (!run('构建', 'npm', ['run', 'build'])) process.exit(1);

// 4) 产物检查
const checks = [
  ['.next/BUILD_ID', '构建产物'],
  ['src/lib/dish-photos.generated.ts', '图片清单'],
];
for (const [p, label] of checks) {
  if (!existsSync(p)) {
    console.error(`\u001b[31m✗ 缺少${label}：${p}\u001b[0m`);
    process.exit(1);
  }
}
const size = (p) => (existsSync(p) ? (statSync(p).size / 1024).toFixed(0) + 'KB' : '-');
console.log(`${STEP('产物检查')} BUILD_ID ${size('.next/BUILD_ID')} · 清单 ${size('src/lib/dish-photos.generated.ts')}`);

console.log(`
\u001b[32m=== 构建完成 ===\u001b[0m
本地预览：node server.mjs  →  http://localhost:3000/food
线上部署：用托管工具发布（参数见 docs/deploy.md），部署会重新构建
`);
