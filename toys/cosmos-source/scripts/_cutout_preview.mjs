// One-off visual verification: run the NEW background-relative cutout (same math as
// applyRealPhoto) offline on real images, composite over a dark cosmic background, save PNGs.
import sharp from 'sharp';

const files = ['sagittarius-dsph', 'fornax-dwarf', 'ic-10', 'M83', 'M31'];
for (const f of files) {
  const { data, info } = await sharp(`public/cosmos/${f}.jpg`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels;
  const hist = new Uint32Array(256);
  const bw = Math.max(2, Math.round(Math.min(W, H) * 0.04));
  let n = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (x >= bw && x < W - bw && y >= bw && y < H - bw) continue;
      const i = (y * W + x) * C;
      hist[(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0]++; n++;
    }
  }
  let acc = 0, bg = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n / 2) { bg = v; break; } }
  for (let i = 0; i < W * H; i++) {
    const p = i * C;
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    let a = (lum - bg - 6) / 64; a = a < 0 ? 0 : a > 1 ? 1 : a; a = a * a * (3 - 2 * a);
    data[p + 3] = (a * 255) | 0;
  }
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const p = i * C, q = i * 3, a = data[p + 3] / 255;
    out[q] = Math.round(data[p] * a + 10 * (1 - a));      // #0a101e cosmic background
    out[q + 1] = Math.round(data[p + 1] * a + 16 * (1 - a));
    out[q + 2] = Math.round(data[p + 2] * a + 38 * (1 - a));
  }
  await sharp(out, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`scripts/_cutout_${f}.png`);
  console.log(`${f}: bg=${bg}  ${W}x${H} -> scripts/_cutout_${f}.png`);
}
