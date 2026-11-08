// One-off: parse remaining Local Group dwarf satellites from universe-data.ts, convert their
// galactic (l,b) -> equatorial (RA,Dec), and EMIT a bash download script (curl works in bash;
// node execSync curl is broken under this sandbox's Windows spawn). Run the emitted script, then
// /tmp/dwarf_ok.txt lists successful 'en|/cosmos/slug.jpg' lines to paste into textures.ts.
import { readFileSync } from 'node:fs';

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const R = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762],
];
function gal2eq(lDeg, bDeg) {
  const l = lDeg * D2R, b = bDeg * D2R;
  const xg = Math.cos(b) * Math.cos(l), yg = Math.cos(b) * Math.sin(l), zg = Math.sin(b);
  const Xe = R[0][0] * xg + R[1][0] * yg + R[2][0] * zg;
  const Ye = R[0][1] * xg + R[1][1] * yg + R[2][1] * zg;
  const Ze = R[0][2] * xg + R[1][2] * yg + R[2][2] * zg;
  let ra = Math.atan2(Ye, Xe) * R2D; if (ra < 0) ra += 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, Ze))) * R2D;
  return [ra, dec];
}

const TARGETS = [
  'Sagittarius dSph', 'Canis Major Dwarf', 'Leo I', 'Leo II', 'Ursa Minor Dwarf',
  'Draco Dwarf', 'Carina Dwarf', 'Sextans Dwarf', 'Sculptor Dwarf', 'Fornax Dwarf',
  'Antlia Dwarf', 'IC 10', 'Pegasus Dwarf (DDO 216)', 'Leo A', 'Aquarius Dwarf', 'SagDIG',
];
const src = readFileSync('src/lib/cosmos/universe-data.ts', 'utf8');
const slugOf = (en) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let bash = '#!/bin/bash\nset -u\nrm -f /tmp/dwarf_ok.txt\n';
for (const en of TARGETS) {
  const re = new RegExp(`en:\\s*'${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?l:\\s*(-?[\\d.]+)[\\s\\S]*?b:\\s*(-?[\\d.]+)`);
  const m = src.match(re);
  if (!m) { console.error(`SKIP (no l,b): ${en}`); continue; }
  const [ra, dec] = gal2eq(parseFloat(m[1]), parseFloat(m[2]));
  const slug = slugOf(en);
  const urls = ['DSS2R', 'DSS2B', '2MASS'].map((s) =>
    `https://skyview.gsfc.nasa.gov/cgi-bin/images?Position=${ra.toFixed(5)},${dec.toFixed(5)}&Survey=${s}&Return=JPG&Size=0.6&Pixels=1000`);
  bash += `\necho "--- ${en} (l=${m[1]} b=${m[2]} -> RA=${ra.toFixed(3)} Dec=${dec.toFixed(3)}) ---"\n`;
  bash += `ok=0\nfor u in \\\n  '${urls[0]}' \\\n  '${urls[1]}' \\\n  '${urls[2]}' ; do\n`;
  bash += `  curl -sL --max-time 45 -o /tmp/_dw.jpg "$u" 2>/dev/null\n`;
  bash += `  if head -c2 /tmp/_dw.jpg | grep -q $'\\xff\\xd8'; then cp /tmp/_dw.jpg "public/cosmos/${slug}.jpg"; echo "OK ${slug}.jpg"; echo '${en}|/cosmos/${slug}.jpg' >> /tmp/dwarf_ok.txt; ok=1; break; fi\n`;
  bash += `done\nif [ $ok -eq 0 ]; then echo "FAIL ${en}"; fi\n`;
}
process.stdout.write(bash);
