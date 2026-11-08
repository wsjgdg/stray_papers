// Offline verification for P2-1 generated data (west-constellations.ts).
import { WEST_CONSTELLATIONS, WEST_BRIGHT_STARS } from "../src/lib/cosmos/west-constellations";

let pass = true;
const ok = (c: boolean, m: string) => {
  if (!c) {
    console.log(`FAIL  ${m}`);
    pass = false;
  }
};

ok(WEST_CONSTELLATIONS.length >= 88, `>=88 constellations (got ${WEST_CONSTELLATIONS.length})`);
const names = new Set<string>();
let lineCount = 0;
for (const c of WEST_CONSTELLATIONS) {
  ok(c.name.length > 0, "constellation has name");
  ok(!/^[A-Z][a-z]{2}$/.test(c.name), `name is Chinese not 3-letter id (${c.name})`);
  names.add(c.name);
  ok(c.stars.length >= 2, `${c.name}: >=2 vertices`);
  ok(c.lines.length >= 1, `${c.name}: >=1 line`);
  for (const [a, b] of c.lines) {
    lineCount++;
    ok(
      a >= 0 && a < c.stars.length && b >= 0 && b < c.stars.length,
      `${c.name}: line indices in bounds`,
    );
  }
  for (const [ra, dec, mag] of c.stars) {
    ok(Number.isFinite(ra) && Number.isFinite(dec) && Number.isFinite(mag), `${c.name}: finite star coords`);
    ok(dec >= -90 && dec <= 90, `${c.name}: dec in [-90,90]`);
  }
}
// Serpens split => 89 features, 88 unique display names expected
ok(names.size === 88, `88 unique constellation names (got ${names.size})`);

ok(WEST_BRIGHT_STARS.length >= 250 && WEST_BRIGHT_STARS.length <= 350, `~300 bright stars (got ${WEST_BRIGHT_STARS.length})`);
let maxMag = 0;
for (const s of WEST_BRIGHT_STARS) {
  ok(Number.isFinite(s.ra) && Number.isFinite(s.dec) && Number.isFinite(s.bv), `star hip ${s.hip}: finite`);
  ok(s.dec >= -90 && s.dec <= 90, `star hip ${s.hip}: dec in range`);
  ok(s.mag <= 3.5 + 1e-6, `star hip ${s.hip}: mag<=3.5 (got ${s.mag})`);
  maxMag = Math.max(maxMag, s.mag);
}
ok(maxMag <= 3.5 + 1e-6, `max bright-star mag <= 3.5 (got ${maxMag.toFixed(2)})`);

console.log(
  pass
    ? `\nVERIFY_PASS (${WEST_CONSTELLATIONS.length} constellations, ${lineCount} line segments, ${WEST_BRIGHT_STARS.length} bright stars)`
    : "\nVERIFY_FAIL",
);
process.exit(pass ? 0 : 1);
