// One-off converter: public/cosmos/cosmic-web.json -> public/cosmos/cosmic-web.bin
//
// Binary layout (little-endian):
//   [0..3]   int32  n
//   [4..]    float32[n*3]  pos   (galactic Mpc, x,y,z per point)
//   [..]     float32[n*3]  col   (linear rgb 0..1 per point)
//
// Run:  bun scripts/gen_cosmic_web_bin.mjs
// Reads the committed JSON and overwrites the .bin next to it.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "public", "cosmos");
const jsonPath = join(root, "cosmic-web.json");
const binPath = join(root, "cosmic-web.bin");

const raw = JSON.parse(await readFile(jsonPath, "utf8"));
const { n, pos, col } = raw;
if (!n || pos.length < n * 3 || col.length < n * 3) {
  throw new Error(
    `bad cosmic-web.json: n=${n} pos=${pos?.length} col=${col?.length}`,
  );
}

const positions = Float32Array.from(pos.slice(0, n * 3));
const colors = Float32Array.from(col.slice(0, n * 3));

const buf = Buffer.alloc(4 + positions.byteLength + colors.byteLength);
buf.writeInt32LE(n, 0);
Buffer.from(positions.buffer).copy(buf, 4);
Buffer.from(colors.buffer).copy(buf, 4 + positions.byteLength);

await writeFile(binPath, buf);
console.log(
  `wrote ${binPath}: n=${n}, ${(buf.length / 1024).toFixed(1)} KiB (json was ${(JSON.stringify(raw).length / 1024 / 1024).toFixed(2)} MiB)`,
);
