/**
 * 把 VLM 转录的 JSONL 合并成项目数据，并与仓库现成数据交叉校验。
 *
 * 用法：
 *   node scripts/ingest-vlm-jsonl.mjs <输入.jsonl> [--write]
 *
 * 输入：每行一个 JSON 对象，字段见 docs/vlm-prompt.md
 * 输出：
 *   - .cache/vlm-merged.json（合并后全量）
 *   - 报告：编码重复、与仓库值不一致的条目数
 *   - 加 --write 时：生成 src/lib/cfcd-extra.generated.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const write = process.argv.includes('--write');
if (!src || !fs.existsSync(src)) {
  console.error('用法: node scripts/ingest-vlm-jsonl.mjs <输入.jsonl> [--write]');
  process.exit(1);
}

const norm = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === '—' || s === '-' || s === '–') return null;
  const n = Number(s.replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const rows = [];
let bad = 0;
for (const [i, line] of fs.readFileSync(src, 'utf8').split('\n').entries()) {
  const t = line.trim();
  if (!t) continue;
  let o;
  try {
    o = JSON.parse(t);
  } catch {
    bad += 1;
    continue;
  }
  const list = Array.isArray(o) ? o : (o.rows ?? [o]);
  for (const r of list) {
    const code = String(r.code ?? '').trim();
    if (!/^\d{6}[a-z]?$/i.test(code)) continue;
    rows.push({
      code,
      name: String(r.name ?? '').trim(),
      edible: norm(r.edible),
      energyKcal: norm(r.energyKcal),
      proteinG: norm(r.proteinG),
      fatG: norm(r.fatG),
      choG: norm(r.choG),
      cholesterolMg: norm(r.cholesterolMg),
      naMg: norm(r.naMg),
      kMg: norm(r.kMg),
      caMg: norm(r.caMg),
      pMg: norm(r.pMg),
      mgMg: norm(r.mgMg),
      feMg: norm(r.feMg),
      znMg: norm(r.znMg),
      seUg: norm(r.seUg),
      src: String(r.src ?? ''),
      bookPage: r.bookPage ?? null,
      side: r.side ?? null,
    });
  }
}

// 同编码多行（左右页各一次）→ 合并，非空字段优先
const byCode = new Map();
for (const r of rows) {
  const prev = byCode.get(r.code);
  if (!prev) {
    byCode.set(r.code, { ...r });
    continue;
  }
  for (const [k, v] of Object.entries(r)) {
    if (v !== null && v !== '' && (prev[k] === null || prev[k] === '')) prev[k] = v;
  }
}

// 与仓库现成数据比对
let repo = [];
try {
  const csv = fs.readFileSync('.cache/cfcd.csv', 'utf8').replace(/^\uFEFF/, '');
  const lines = csv.split('\n');
  const head = lines[0].split(',');
  const iCode = head.indexOf('foodCode');
  const iNa = head.indexOf('Na');
  repo = lines.slice(1).map((l) => {
    const c = l.split(',');
    return { code: c[iCode], na: norm(c[iNa]) };
  });
} catch {
  console.warn('（未找到 .cache/cfcd.csv，跳过交叉校验）');
}
const repoNa = new Map(repo.filter((r) => r.code).map((r) => [r.code, r.na]));

const merged = [...byCode.values()].filter((r) => r.naMg !== null || r.energyKcal !== null);
let dup = 0;
let diff = 0;
const diffs = [];
for (const r of merged) {
  const base = repoNa.get(r.code);
  if (base != null && r.naMg != null) {
    const delta = Math.abs(base - r.naMg);
    if (delta > Math.max(1, base * 0.05)) {
      diff += 1;
      diffs.push(`${r.code} ${r.name}: 书 ${r.naMg} vs 仓库 ${base}`);
    }
  }
}
dup = rows.length - byCode.size;

fs.mkdirSync('.cache', { recursive: true });
fs.writeFileSync('.cache/vlm-merged.json', JSON.stringify(merged, null, 1));

console.log(`解析 ${rows.length} 行 → 去重后 ${merged.length} 条（同编码合并 ${dup} 条）`);
if (bad) console.log(`跳过无法解析的行 ${bad}`);
console.log(`与仓库钠值不一致 ${diff} 条` + (diff ? '：' : ''));
diffs.slice(0, 15).forEach((d) => console.log('  ' + d));

if (write) {
  const body = merged
    .map(
      (r) =>
        `  '${r.code}': { name: ${JSON.stringify(r.name)}, naMg: ${r.naMg}, energyKcal: ${r.energyKcal}, proteinG: ${r.proteinG}, fatG: ${r.fatG} },`,
    )
    .join('\n');
  fs.writeFileSync(
    'src/lib/cfcd-extra.generated.ts',
    `// 由 scripts/ingest-vlm-jsonl.mjs 生成。数据来源：《中国食物成分表 标准版 第6版》扫描页 VLM 转录。\n` +
      `// 仅作主料参照，非菜肴实测。\n` +
      `export interface CfcdExtra { name: string; naMg: number | null; energyKcal: number | null; proteinG: number | null; fatG: number | null }\n\n` +
      `export const CFCD_EXTRA: Record<string, CfcdExtra> = {\n${body}\n};\n`,
  );
  console.log('→ src/lib/cfcd-extra.generated.ts');
}
