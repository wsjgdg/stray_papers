// 为 release/ 下的分发产物生成 SHA256SUMS.txt（校验用）。
// 未签名安装包在 SmartScreen 会告警，发布页同时给出 SHA256 供用户校验。
// 用法：node scripts/gen-checksums.mjs [目录]（默认 release）
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv[2] ?? path.join(__dirname, '..', 'release'));
const SKIP = new Set(['SHA256SUMS.txt', 'latest.yml', 'builder-effective-config.yaml']);

if (!fs.existsSync(dir)) {
  console.error(`[checksums] 目录不存在: ${dir}`);
  process.exit(1);
}

function walk(d) {
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const files = walk(dir)
  .filter((f) => !SKIP.has(path.basename(f)))
  // 排除中间产物目录，只校验最终可分发文件
  .filter((f) => !/[/\\](win-unpacked|win-ia32-unpacked|mac|linux)[/\\]/.test(f))
  .sort();

const lines = files.map((f) => {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  return `${hash}  ${path.relative(dir, f).split(path.sep).join('/')}`;
});

const out = path.join(dir, 'SHA256SUMS.txt');
fs.writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
console.log(`[checksums] wrote ${out} (${lines.length} files)`);
