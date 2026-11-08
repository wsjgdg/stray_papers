// One-off helper: downscale an ESO JPEG to <=2048px long edge (WebGL-safe),
// preserving aspect ratio, for cosmos real-photo sprites. Usage:
//   node scripts/_resize.mjs <in> <out>
import { argv } from 'node:process';
import sharp from 'sharp';

const [, , inPath, outPath] = argv;
if (!inPath || !outPath) {
  console.error('usage: node scripts/_resize.mjs <in> <out>');
  process.exit(2);
}
const CAP = 2048;
const meta = await sharp(inPath).metadata();
const long = Math.max(meta.width, meta.height);
const scale = Math.min(1, CAP / long);
const w = Math.round(meta.width * scale);
const h = Math.round(meta.height * scale);
await sharp(inPath).resize(w, h).jpeg({ quality: 88 }).toFile(outPath);
console.log(`resized ${meta.width}x${meta.height} -> ${w}x${h} => ${outPath}`);
