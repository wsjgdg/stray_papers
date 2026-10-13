#!/usr/bin/env node
/* build-standalone.mjs — 把 ES 模块工程（src/）打回单文件 HTML 分发版（dist/quantum-field.html）。
   恢复重构前的「双击即开」能力（file:// 无 CORS 限制，经典 <script> 无需 HTTP）。

   做法（mini-bundler，零依赖）：
   1. 从 index.html 找到入口 <script type="module" src="./src/main.js">
   2. 以 main.js 为根做 DFS 拓扑排序（依赖在前），带循环检测
   3. 逐模块剥离子句：import 行整行删除；export 声明脱帽（export const/function/class → 去掉 export）
   4. 按拓扑序拼接为一段经典 <script>（顶层命名已审计唯一，见 scripts/README 或构建输出）
   5. 替换 index.html 中的模块 script 标签，输出 dist/quantum-field.html

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

/* ---------- 1. 入口定位 ---------- */
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const m = html.match(/<script\s+type="module"\s+src="([^"]+)"\s*><\/script>/);
if (!m) fail('index.html 中未找到 <script type="module" src="..."> 入口');
const entryRel = m[1];
const entry = resolve(ROOT, entryRel);

/* ---------- 2. 拓扑排序 ---------- */
/* 只认列 0 的 import/export：顶层模块语句不可能缩进；缩进的 import 样式行只可能是
   文档注释里的示例（如 main.js 顶部「课程站嵌入」片段）——记为警告，不参与解析。 */
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
visit(entry);

/* ---------- 3. 剥离子句 + 拼接 ---------- */
const parts = [];
parts.push(`/*! 薛定谔工场 · 单文件分发版 — 由 scripts/build-standalone.mjs 自动生成，请勿手改。
    源码工程（ES 模块，课程站组件化用）：index.html + src/
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
  fail('bundle 语法自校验未过（疑似注释/字符串被误剥离）:\n' + (e.stderr || e.message));
}

/* ---------- 4. </script> 防护 ---------- */
const nScript = (bundle.match(/<\/script>/gi) || []).length;
if (nScript) bundle = bundle.replace(/<\/script>/gi, '<\\/script>');

/* ---------- 5. 注入 HTML ---------- */
const distDir = resolve(ROOT, 'dist');
mkdirSync(distDir, { recursive: true });
const out = html.replace(m[0], `<script>\n${bundle}\n</script>`);
const outPath = resolve(distDir, 'quantum-field.html');
writeFileSync(outPath, out);

console.log(`BUILD OK: dist/quantum-field.html (${(out.length/1024).toFixed(1)} KB)`);
console.log(`  模块 ${order.length} 个，拓扑序: ${order.map(f => relative(ROOT, f)).join(' → ')}`);
if (nScript) console.log(`  注: 转义了 ${nScript} 处 </script> 字面量`);
for (const w of warnings) console.log('  WARN: ' + w);
