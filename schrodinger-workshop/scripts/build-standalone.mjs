#!/usr/bin/env node
/* build-standalone.mjs — 把 ES 模块工程（src/）打回单文件 HTML 分发版（dist/）。
   恢复重构前的「双击即开」能力（file:// 无 CORS 限制，经典 <script> 无需 HTTP）。

   R72 起工程有多个页面（PAGES 表见下）：
     index.html      → dist/quantum-field.html（单粒子主场，入口 src/main.js）
     two-body.html   → dist/two-body.html（双粒子构型空间，入口 src/two-body-main.js）
     hubbard.html    → dist/hubbard.html（格点费米-哈伯德，入口 src/hubbard-main.js）
     paths.html      → dist/paths.html（费曼路径求和，入口 src/paths-main.js）
     qcircuit.html   → dist/qcircuit.html（小规模量子线路，入口 src/qcircuit-main.js）
     noise.html      → dist/noise.html（开放量子系统：T₁/T₂，入口 src/noise-main.js）
     qec.html        → dist/qec.html（3 比特重复码纠错，入口 src/qec-main.js）
 *     shor.html       → dist/shor.html（Shor 9 比特级联码，入口 src/shor-main.js）
 *     gatenoise.html  → dist/gatenoise.html（线路级门噪声，入口 src/gatenoise-main.js）
 *     flag.html       → dist/flag.html（综合提取容错：冗余验证 vs 猫态，入口 src/flag-main.js）
 *     rounds.html     → dist/rounds.html（多轮提取 + 跨轮联合解码，入口 src/rounds-main.js）
 *     cycle.html      → dist/cycle.html（循环 EC + 逻辑线路，入口 src/cycle-main.js）
 *     family.html     → dist/family.html（码族与真阈值：重复码族 / Steane 级联，入口 src/family-main.js）
   各页共用 src/core/*（仅 index 用）；各自独立 bundle（拓扑序不同），互不影响。

   做法（mini-bundler，零依赖）：
   1. 从页面 HTML 找到入口 <script type="module" src="./src/...">
   2. 以入口为根做 DFS 拓扑排序（依赖在前），带循环检测
   3. 逐模块剥离子句：import 行整行删除；export 声明脱帽（export const/function/class → 去掉 export）
   4. 按拓扑序拼接为一段经典 <script>（顶层命名已审计唯一，见构建输出）
   5. 替换页面中的模块 script 标签，输出到 dist/

   前提假设（违反即构建失败并明确指出，不静默出错）：
   - 所有 import/export 均为单行静态形式（无多行、无 export default、无 export {} 列表）
   - 无 import.meta / 动态 import()
   - 跨模块顶层命名不冲突（拼接后同一 script 作用域）
   - 代码中不出现 </script> 字面量（模板字面量内的会被转义为 <\/script>，语义等价） */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => { console.error('BUILD FAIL: ' + msg); process.exit(1); };

/* 页面表：html 源 → dist 输出名（R72 增加 two-body 页） */
const PAGES = [
  ['index.html', 'quantum-field.html'],
  ['two-body.html', 'two-body.html'],
  ['hubbard.html', 'hubbard.html'],
  ['paths.html', 'paths.html'],
  ['qcircuit.html', 'qcircuit.html'],
  ['noise.html', 'noise.html'],
  ['qec.html', 'qec.html'],
  ['shor.html', 'shor.html'],
  ['gatenoise.html', 'gatenoise.html'],
  ['flag.html', 'flag.html'],
  ['rounds.html', 'rounds.html'],
  ['cycle.html', 'cycle.html'],
  ['family.html', 'family.html'],
];

/* ---------- 1. 入口定位 ---------- */
function findEntry(html, htmlName){
  const m = html.match(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/);
  if (!m) fail(htmlName + ' 中未找到 <script type="module" src="..."> 入口');
  return { tag: m[0], entry: resolve(ROOT, m[1]) };
}

/* ---------- 2. 拓扑排序 ---------- */
/* 只认列 0 的 import/export：顶层模块语句不可能缩进；缩进的 import 样式行只可能是
   文档注释里的示例——记为警告，不参与解析。 */
const order = [];            /* 后序：依赖在前 */
const state = new Map();     /* path -> 'visiting' | 'done'，用于循环检测 */
const warnings = [];
const IMPORT_FROM = /^import\s+(?:[\s\S]*?)\s+from\s+['"](\.[^'"]+)['"];?\s*$/;
const IMPORT_BARE = /^import\s+['"](\.[^'"]+)['"];?\s*$/;
const IMPORT_LINE = /^import\b/;
const INDENTED_IMPORT = /^[ \t]+import\b/;

function visit(file){
  const s = state.get(file);
  if (s === 'done') return;
  if (s === 'visiting') fail('检测到循环 import: ' + relative(ROOT, file));
  state.set(file, 'visiting');
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!IMPORT_LINE.test(t)) return;
    if (INDENTED_IMPORT.test(line)){
      warnings.push(`${relative(ROOT, file)}:${i+1} 缩进 import 样式行（视为文档注释示例，不解析）: ${t}`);
      return;
    }
    const mm = t.match(IMPORT_FROM) || t.match(IMPORT_BARE);
    if (!mm) fail(`${relative(ROOT, file)}:${i+1}: 无法解析的 import 形式（仅支持单行静态 import）: ${t}`);
    visit(resolve(dirname(file), mm[1]));
  });
  state.set(file, 'done');
  order.push(file);
}

/* ---------- 3. 剥离子句 + 拼接（单页） ---------- */
function bundlePage(htmlName, outName){
  order.length = 0; state.clear(); warnings.length = 0;
  const html = readFileSync(resolve(ROOT, htmlName), 'utf8');
  const { tag, entry } = findEntry(html, htmlName);
  visit(entry);

  const parts = [];
  parts.push(`/*! 薛定谔工场 · 单文件分发版（${outName}）— 由 scripts/build-standalone.mjs 自动生成，请勿手改。
    源码工程（ES 模块，课程站组件化用）：${htmlName} + src/
    模块拼接序（拓扑序，依赖在前）：`);
  for (const f of order) parts.push('      ' + relative(ROOT, f));
  parts.push('*/\n');

  for (const file of order){
    let src = readFileSync(file, 'utf8');
    const out = [];
    for (const line of src.split('\n')){
      const t = line.trim();
      if (IMPORT_LINE.test(t) && !INDENTED_IMPORT.test(line)){
        if (!(t.match(IMPORT_FROM) || t.match(IMPORT_BARE)))
          fail(`${relative(ROOT, file)}: 无法剥离的 import: ${t}`);
        continue;                                   /* 整行删除 */
      }
      if (/^export\s+default\b/.test(t)) fail(`${relative(ROOT, file)}: 不支持 export default`);
      if (/^export\s*\{/.test(t)) fail(`${relative(ROOT, file)}: 不支持 export {} 列表`);
      out.push(line.replace(/^(\s*)export\s+(?=(const|let|var|function|class|async)\b)/, '$1'));
    }
    parts.push(`/* ===== ${relative(ROOT, file)} ===== */\n${out.join('\n').trim()}\n`);
  }
  let bundle = parts.join('\n');

  /* ---------- 3.5 自校验：bundle 必须是合法 JS（node --check 只解析不执行） ---------- */
  const tmpJs = resolve(tmpdir(), 'qf-bundle-check.mjs');
  writeFileSync(tmpJs, bundle);
  try {
    execFileSync(process.execPath, ['--check', tmpJs], { stdio: 'pipe' });
  } catch (e) {
    fail(`${outName} bundle 语法自校验未过（疑似注释/字符串被误剥离）:\n` + (e.stderr || e.message));
  }

  /* ---------- 3.6 dist 导航 href 重写（R91） ----------
   * PAGES 里改了名的页（index.html → quantum-field.html），其导航 href 必须跟着改：
   * nav.js 的 NAV 条目与 navLinksHtml 的自链过滤是同一份字面量，两处一起替换才自洽
   * （只改 NAV 不改过滤 ⟹ 主页会多出一条指向自己的「主页」链）。替换前 R91 实测：
   * dist/index.html 404 ⟹ 12 个子页的「主页」链在分发版全部断掉。 */
  for (const [srcName, dstName] of PAGES){
    if (srcName === dstName) continue;
    const from = `'./${srcName}'`, to = `'./${dstName}'`;
    if (bundle.includes(from)){
      const n = bundle.split(from).length - 1;
      bundle = bundle.split(from).join(to);
      console.log(`  href 重写: ${from} → ${to}（${n} 处：NAV 条目 + 自链过滤）`);
    }
  }

  /* ---------- 4. </script> 防护 ---------- */
  const nScript = (bundle.match(/<\/script>/gi) || []).length;
  if (nScript) bundle = bundle.replace(/<\/script>/gi, '<\\/script>');

  /* ---------- 5. 注入 HTML ---------- */
  const distDir = resolve(ROOT, 'dist');
  mkdirSync(distDir, { recursive: true });
  const out = html.replace(tag, `<script>\n${bundle}\n</script>`);
  const outPath = resolve(distDir, outName);
  writeFileSync(outPath, out);

  /* ⚠ 体积必须按 UTF-8 字节算（Buffer.byteLength）：JS 字符串 .length 是 UTF-16
   * 码元数，中文每字只计 1，日志曾一贯偏小 15–25%（R85 对账 dist 时发现）。 */
  console.log(`BUILD OK: dist/${outName} (${(Buffer.byteLength(out, 'utf8')/1024).toFixed(1)} KB)`);
  console.log(`  模块 ${order.length} 个，拓扑序: ${order.map(f => relative(ROOT, f)).join(' → ')}`);
  if (nScript) console.log(`  注: 转义了 ${nScript} 处 </script> 字面量`);
  for (const w of warnings) console.log('  WARN: ' + w);
}

for (const [htmlName, outName] of PAGES) bundlePage(htmlName, outName);
