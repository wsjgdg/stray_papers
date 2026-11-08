// 用 mupdf(WASM) 按真实页序渲染 PDF 页面——不依赖 poppler/ghostscript/pip。
// 用法：node scripts/render-pdf.mjs <v1|v2> <page> [scale]
import fs from 'node:fs';
import path from 'node:path';

const V1 = 'C:/Users/sibop/Desktop/中国食物成分表 标准版 第一册 第6版 杨月欣 北大医 2018 中 扫描 ※ 9787565916991.pdf';
const V2 = 'C:/Users/sibop/Desktop/中国食物成分表 标准版 第二册 第6版 杨月欣 北大医 2019 中 扫描 ※ 9787565919787.pdf';

const which = process.argv[2] ?? 'v2';
const pageNo = Number(process.argv[3] ?? 1);
const scale = Number(process.argv[4] ?? 1.6);

const mupdf = await import('mupdf');
const src = which === 'v1' ? V1 : V2;
const doc = mupdf.Document.openDocument(fs.readFileSync(src), 'application/pdf');
const n = doc.countPages();
if (pageNo < 1 || pageNo > n) {
  console.error(`page out of range 1..${n}`);
  process.exit(1);
}
const page = doc.loadPage(pageNo - 1);
const pm = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
const out = path.join('.cache', 'pg', `${which}_${String(pageNo).padStart(3, '0')}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, pm.asPNG());
console.log(`${which} total=${n} page=${pageNo} → ${out} ${pm.getWidth()}x${pm.getHeight()}`);
