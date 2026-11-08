// Offline verification of the L4 (Nearby Universe) radial compression.
// Asserts that every galaxy in NEARBY_GALAXIES + VIRGO_CLUSTER lands within the
// L4 camera frustum (SCALE_LEVELS[4].sceneScale = 40) after `compress`, so the
// cloud is spread out (not crammed) yet never pushed off-screen.
import { readFileSync } from "node:fs";

const src = readFileSync(
  new URL("../src/lib/cosmos/universe-data.ts", import.meta.url),
  "utf8",
);

// Slice the two L4 galaxy tables.
const start = src.indexOf("export const NEARBY_GALAXIES");
const virgoEnd = src.indexOf("export const FAMOUS_GALAXIES");
if (start < 0 || virgoEnd < 0) {
  console.error("VERIFY_FAIL: could not locate galaxy tables");
  process.exit(1);
}
const block = src.slice(start, virgoEnd);
const dists = [...block.matchAll(/distLy:\s*([\d_]+)/g)].map((m) =>
  Number(m[1].replace(/_/g, "")),
);
if (dists.length === 0) {
  console.error("VERIFY_FAIL: no distLy parsed");
  process.exit(1);
}

// Mirror the engine's L4 mapping.
const compress = (ly) => 4.0 * Math.sqrt(ly / 1_000_000);
const CAM = 40; // SCALE_LEVELS[4].sceneScale
const MARGIN = 0.9; // keep within 90% of the view radius

const radii = dists.map(compress);
const min = Math.min(...radii);
const max = Math.max(...radii);
console.log(`galaxies parsed : ${dists.length}`);
console.log(`distLy range    : ${(Math.min(...dists) / 1e6).toFixed(1)}–${(Math.max(...dists) / 1e6).toFixed(1)} Mly`);
console.log(`radius range    : ${min.toFixed(2)}–${max.toFixed(2)} (camera at ${CAM})`);
console.log(`radial spread   : ${(max / min).toFixed(2)}×`);

let ok = true;
if (max > CAM * MARGIN) {
  console.error(`VERIFY_FAIL: max radius ${max.toFixed(2)} exceeds ${CAM * MARGIN}`);
  ok = false;
}
if (min < 1) {
  console.error(`VERIFY_FAIL: min radius ${min.toFixed(2)} too small`);
  ok = false;
}
// The whole point of the change: real depth, not a flat shell. Require >1.5× spread.
if (max / min < 1.5) {
  console.error(`VERIFY_FAIL: radial spread ${ (max / min).toFixed(2) }× too crammed`);
  ok = false;
}
console.log(ok ? "VERIFY_PASS" : "VERIFY_FAIL");
process.exit(ok ? 0 : 1);
