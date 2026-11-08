// One-off: robust M83 nucleus locator. The old "top-0.5% brightest weighted centroid" was pulled
// off the nucleus by saturated foreground stars (visible diffraction spikes in the photo). The
// nucleus is an EXTENDED bright blob, so a sliding-window box-sum peaks there, not on point stars.
import sharp from 'sharp';

const { data, info } = await sharp('public/cosmos/M83.jpg').greyscale().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
console.log(`M83.jpg ${W}x${H}`);

// Integral image for O(1) box sums
const ii = new Float64Array((W + 1) * (H + 1));
for (let y = 0; y < H; y++) {
  let rowSum = 0;
  for (let x = 0; x < W; x++) {
    rowSum += data[y * W + x];
    ii[(y + 1) * (W + 1) + (x + 1)] = ii[y * (W + 1) + (x + 1)] + rowSum;
  }
}
const boxSum = (x0, y0, s) =>
  ii[(y0 + s) * (W + 1) + (x0 + s)] - ii[y0 * (W + 1) + (x0 + s)] -
  ii[(y0 + s) * (W + 1) + x0] + ii[y0 * (W + 1) + x0];

console.log('--- sliding-window box-sum peak (extended blob = nucleus) ---');
for (const win of [40, 64, 96, 128]) {
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y + win <= H; y += 2) {
    for (let x = 0; x + win <= W; x += 2) {
      const s = boxSum(x, y, win);
      if (s > best) { best = s; bx = x; by = y; }
    }
  }
  const fx = (bx + win / 2) / W, fy = (by + win / 2) / H;
  console.log(`win=${String(win).padStart(3)}  center=(${bx + win / 2}, ${by + win / 2})  fx=${fx.toFixed(4)} fy=${fy.toFixed(4)}`);
}

console.log('--- OLD method: top-0.5% brightest weighted centroid (contaminated) ---');
const idx = Array.from({ length: W * H }, (_, i) => i).sort((a, b) => data[b] - data[a]);
const nTop = Math.round(W * H * 0.005);
let sx = 0, sy = 0, sw = 0;
for (let k = 0; k < nTop; k++) { const i = idx[k]; const w = data[i]; sx += (i % W) * w; sy += ((i / W) | 0) * w; sw += w; }
console.log(`fx=${(sx / sw / W).toFixed(4)} fy=${(sy / sw / H).toFixed(4)}  (n=${nTop})`);
