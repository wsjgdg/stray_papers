/**
 * 把 public/dishes/ 下的图统一压到 900px 宽、JPEG q82，并统一成 .jpg 后缀。
 * 用法：node scripts/compress-dish-photos.mjs [宽=900] [质量=82]
 * 需要 sharp（临时依赖）：npm i --no-save sharp
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve('public/dishes');
const WIDTH = Number(process.argv[2] || 900);
const QUALITY = Number(process.argv[3] || 82);

const files = fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
let before = 0;
let after = 0;
let failed = [];

for (const f of files) {
  const p = path.join(DIR, f);
  const st = fs.statSync(p);
  before += st.size;
  const out = path.join(DIR, f.replace(/\.\w+$/, '.jpg'));
  const tmp = out + '.tmp';
  try {
    const buf = await sharp(p)
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
    if (out !== p) fs.unlinkSync(p);
    after += buf.length;
  } catch (e) {
    try {
      fs.existsSync(tmp) && fs.unlinkSync(tmp);
    } catch {}
    failed.push(`${f}: ${e.message.slice(0, 60)}`);
    after += st.size;
  }
}

console.log(`处理 ${files.length} 张：${(before / 1048576).toFixed(1)}MB → ${(after / 1048576).toFixed(1)}MB`);
if (failed.length) console.log('失败：\n' + failed.map((x) => '  - ' + x).join('\n'));
