// 把 dist/ 下的前端产物以 base64 内嵌为 TS 模块，供单文件 exe / pkg 场景使用。
// 该产物是构建中间物（~880KB），不入 git：由 predev / prebuild / pretypecheck 自动生成。
// dist/ 不存在时写出空占位，保证 clone 后未被构建也能通过类型检查。
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const genDir = join(root, 'server', 'generated');
const outFile = join(genDir, 'webAssets.ts');

function walk(dir, base, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(p).isDirectory()) walk(p, rel, out);
    else out[rel] = readFileSync(p).toString('base64');
  }
}

function emit(assets) {
  const ts =
    `// 自动生成，勿手改。由 scripts/gen-web-assets.mjs 从 dist/ 收集。\n` +
    `export const WEB_ASSETS: Record<string, string> = ${JSON.stringify(assets)};\n` +
    `export const WEB_ENTRY = 'index.html';\n`;
  mkdirSync(genDir, { recursive: true });
  writeFileSync(outFile, ts);
}

if (!existsSync(join(distDir, 'index.html'))) {
  emit({});
  console.log('[gen-web-assets] dist/ 未构建 → 写出空占位（运行 npm run build 后自动内联真实产物）');
  process.exit(0);
}

const assets = {};
walk(distDir, '', assets);
emit(assets);
console.log(`[gen-web-assets] ${Object.keys(assets).length} 个文件已内嵌 → server/generated/webAssets.ts`);
