/**
 * 把候选图拼成一张对比图，便于人工挑选。
 * 用法：node scripts/make-contact-sheet.mjs [每行张数=6] [缩略图宽=260]
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = path.resolve('public/dishes/_candidates');
const COLS = Number(process.argv[2] || 6);
const TW = Number(process.argv[3] || 260);
const TH = Math.round(TW * 0.72);
const LABEL_H = 18;

const files = fs
  .readdirSync(DIR)
  .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, 'zh'));

const rows = Math.ceil(files.length / COLS);
const W = COLS * TW;
const H = rows * (TH + LABEL_H);

const composites = [];
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const left = (i % COLS) * TW;
  const top = Math.floor(i / COLS) * (TH + LABEL_H);
  try {
    const thumb = await sharp(path.join(DIR, file))
      .resize(TW - 4, TH - 4, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    composites.push({ input: thumb, left: left + 2, top: top + 2 });
  } catch {
    /* 跳过坏图 */
  }
  const label = file.replace(/\.\w+$/, '').slice(0, 18);
  const svg = `<svg width="${TW}" height="${LABEL_H}"><rect width="100%" height="100%" fill="#111"/><text x="6" y="13" font-family="sans-serif" font-size="12" fill="#ddd">${label}</text></svg>`;
  composites.push({ input: Buffer.from(svg), left, top: top + TH });
}

await sharp({ create: { width: W, height: H, channels: 3, background: '#111' } })
  .composite(composites)
  .png()
  .toFile(path.join(DIR, 'contact-sheet.png'));

console.log(`拼图完成：${files.length} 张 → ${W}x${H} → public/dishes/_candidates/contact-sheet.png`);
