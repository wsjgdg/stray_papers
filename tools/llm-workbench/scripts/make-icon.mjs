// 生成 electron/icon.png（512x512，无第三方依赖，纯 zlib 编码 PNG）。
// 仅用于开发期/打包前生成托盘与窗口图标；无需 imagemagick 等外部工具。
// 注意：electron-builder 打包 nsis 要求图标至少 256x256，故此处用 512。
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIZE = 512;

// ── CRC32（PNG chunk 校验） ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// ── 像素：深色底 + 蓝色描边 + 中心浅色卡，读作 App 图标（尺寸按比例缩放） ──
const px = Buffer.alloc(SIZE * SIZE * 4);
const NAVY = [0x0f, 0x16, 0x26];
const BORDER = [0x1b, 0x2a, 0x44];
const ACCENT = [0x5b, 0x9b, 0xff];
const CARD = [0xe6, 0xed, 0xf3];
const b = Math.max(2, Math.round(SIZE * 0.06));
const a0 = Math.round(SIZE * 0.19);
const a1 = Math.round(SIZE * 0.81);
const c0 = Math.round(SIZE * 0.38);
const c1 = Math.round(SIZE * 0.625);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    let col = NAVY;
    if (x < b || y < b || x >= SIZE - b || y >= SIZE - b) col = BORDER;
    else if (x >= a0 && x < a1 && y >= a0 && y < a1) col = ACCENT;
    if (x >= c0 && x < c1 && y >= c0 && y < c1) col = CARD;
    px[i] = col[0];
    px[i + 1] = col[1];
    px[i + 2] = col[2];
    px[i + 3] = 255;
  }
}

// ── IHDR + IDAT（每行前加 filter=0） ──
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // filter type
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'electron', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`[icon] wrote ${out} (${png.length} bytes)`);
