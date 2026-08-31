// 统一回归入口：依次运行全部 verify-* 套件，汇总通过/失败，任一失败则整体非零退出。
// 用法：npm run verify
import { spawn } from 'node:child_process';

const SUITES = [
  { name: 'model-merge', cmd: 'npx', args: ['tsx', 'scripts/verify-model-merge.mjs'] },
  { name: 'config-merge', cmd: 'node', args: ['scripts/verify-config-merge.mjs'] },
  { name: 'bankofai', cmd: 'node', args: ['scripts/verify-bankofai.mjs'] },
  { name: 'p0p1', cmd: 'node', args: ['scripts/verify-p0p1.mjs'] },
  { name: 'p2', cmd: 'node', args: ['scripts/verify-p2.mjs'] },
  { name: 'electron-build', cmd: 'node', args: ['scripts/verify-electron-build.mjs'] },
];

function run({ cmd, args }) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: process.cwd(), stdio: 'inherit', shell: true });
    p.on('close', (code) => resolve(code ?? 1));
    p.on('error', () => resolve(1));
  });
}

const results = [];
for (const s of SUITES) {
  console.log(`\n════════ ${s.name} ════════`);
  const code = await run(s);
  results.push({ name: s.name, ok: code === 0 });
}

console.log(`\n════════ 汇总 ════════`);
let allOk = true;
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  if (!r.ok) allOk = false;
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n结果: ${passed}/${results.length} 套件通过`);
process.exit(allOk ? 0 : 1);
