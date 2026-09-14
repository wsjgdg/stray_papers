// 生成 electron/icon.png（512x512）与 electron/icon.ico（多尺寸 256/128/64/48/32/24/16）。
// 纯 Node（zlib + Buffer），无第三方依赖、无需 imagemagick。
// - PNG：托盘与窗口图标；
// - ICO：NSIS 安装器 / exe 属性 / 任务栏。单尺寸图标在缩放到 16px 时会糊，故内嵌多尺寸。
//   每个 ICO 条目直接放 PNG 数据（Vista+ 支持 PNG 压缩条目，electron-builder 与资源管理器均正常）。
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'electron');
const PNG_SIZE = 512;
const ICO_SIZES = [256, 128, 64, 48, 32, 24, 16];

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

const NAVY = [0x0f, 0x16, 0x26];
const BORDER = [0x1b, 0x2a, 0x44];
const ACCENT = [0x5b, 0x9b, 0xff];
const CARD = [0xe6, 0xed, 0xf3];

/** 渲染正方形 RGBA 像素：深色底 + 蓝色描边 + 中心浅色卡，尺寸按比例缩放 */
function renderPixels(size) {
  const px = Buffer.alloc(size * size * 4);
  const b = Math.max(1, Math.round(size * 0.06));
  const a0 = Math.round(size * 0.19);
  const a1 = Math.round(size * 0.81);
  const c0 = Math.round(size * 0.38);
  const c1 = Math.round(size * 0.625);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let col = NAVY;
      if (x < b || y < b || x >= size - b || y >= size - b) col = BORDER;
      else if (x >= a0 && x < a1 && y >= a0 && y < a1) col = ACCENT;
      if (x >= c0 && x < c1 && y >= c0 && y < c1) col = CARD;
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
      px[i + 3] = 255;
    }
  }
  return px;
}

function renderPng(size) {
  const px = renderPixels(size);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter type
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO 容器：ICONDIR + N × ICONDIRENTRY + PNG 数据（256 用 0 表示） */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dirSize = 16 * entries.length;
  let offset = header.length + dirSize;
  const dirs = [];
  for (const { size, png } of entries) {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size; // width（256 记 0）
    d[1] = size >= 256 ? 0 : size; // height
    d[2] = 0; // palette colors
    d[3] = 0; // reserved
    d.writeUInt16LE(1, 4); // color planes
    d.writeUInt16LE(32, 6); // bits per pixel
    d.writeUInt32LE(png.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += png.length;
    dirs.push(d);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.png)]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const png = renderPng(PNG_SIZE);
const pngPath = path.join(OUT_DIR, 'icon.png');
fs.writeFileSync(pngPath, png);
console.log(`[icon] wrote ${pngPath} (${png.length} bytes)`);

const ico = buildIco(ICO_SIZES.map((size) => ({ size, png: renderPng(size) })));
const icoPath = path.join(OUT_DIR, 'icon.ico');
fs.writeFileSync(icoPath, ico);
console.log(`[icon] wrote ${icoPath} (${ico.length} bytes, sizes ${ICO_SIZES.join('/')})`);
