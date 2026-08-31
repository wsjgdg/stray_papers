// 打包 llm-workbench 为自包含 Windows exe：vite 构建前端 → 内嵌资源 → esbuild 打包后端 → pkg 封装 Node runtime
import { execSync } from 'node:child_process';
import {
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const distDir = join(root, 'dist');
const buildDir = join(root, 'build');
const genDir = join(root, 'server', 'generated');

function walk(dir, base, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(p).isDirectory()) walk(p, rel, out);
    else out[rel] = readFileSync(p).toString('base64');
  }
}

console.log('[1/4] vite build (前端)…');
execSync('npx vite build', { stdio: 'inherit' });

console.log('[2/4] 内嵌前端资源 → server/generated/webAssets.ts');
const assets = {};
walk(distDir, '', assets);
const ts = `// 自动生成，勿手改。由 scripts/build-exe.mjs 从 dist/ 收集。\nexport const WEB_ASSETS: Record<string, string> = ${JSON.stringify(assets)};\nexport const WEB_ENTRY = 'index.html';\n`;
mkdirSync(genDir, { recursive: true });
writeFileSync(join(genDir, 'webAssets.ts'), ts);
console.log(`       ${Object.keys(assets).length} 个文件已内嵌`);

// 注意：bundle 必须落在项目根目录（pkg 对子目录入口的 snapshot 路径解析有 bug）
console.log('[3/4] esbuild 打包后端 → server.bundle.cjs');
rmSync(buildDir, { recursive: true, force: true });
execSync(
  'npx esbuild server/index.ts --bundle --platform=node --target=node18 --format=cjs --outfile=server.bundle.cjs --loader:.ts=ts',
  { stdio: 'inherit' },
);

console.log('[4/4] pkg 封装 Node runtime → llm-workbench.exe');
execSync('npx pkg server.bundle.cjs --targets node18-win-x64 --output llm-workbench.exe', {
  stdio: 'inherit',
});

console.log('\n✅ 完成：llm-workbench.exe 已生成（双击即启动并自动打开浏览器）');
console.log(`   exe 体积：${existsSync(join(root, 'llm-workbench.exe')) ? (statSync(join(root, 'llm-workbench.exe')).size / 1e6).toFixed(1) + ' MB' : '?'}`);
