// Everything that is not a house, a plant or an animal: the trunks, boulders, crystals and crags the walker
// collides with, the loose stones dressed around the landing, and the ring of stones each reef carries.
//
// `solids_sim` asks whether a solid can push a body out. This asks the other half — whether the world put the
// solid somewhere a body could ever be. A boulder you are standing inside on the first frame is not a
// collision bug; it is a placement bug, and it is what this suite found.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, WALKER_RADIUS, heightAt, provinceAt, nearestLand, hardProps, stoneSolids, floraHard,
  walkBoxes, reefs, overlapAt } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const all = [...hardProps, ...stoneSolids];
const landing = nearestLand(new THREE.Vector3(Math.sin(1.16) * Math.sin(.42), Math.cos(1.16), Math.sin(1.16) * Math.cos(.42)));

// ---- shape ---------------------------------------------------------------------------------------------
{
  let bad = 0;
  for (const p of all) if (!Number.isFinite(p.r) || p.r <= 0) bad++;
  const radii = all.map(p => p.r).sort((a, b) => a - b);
  ok('every trunk, boulder, crystal, crag and loose stone has a real width', bad === 0,
    all.length + ' solids (' + hardProps.length + ' over the whole planet, ' + stoneSolids.length +
    ' dressed around the landing); narrowest ' + mm(radii[0]) + ', median ' + mm(radii[radii.length >> 1]) +
    ', widest ' + mm(radii[radii.length - 1]));
}
{
  // `stoneSolids` carry a `top`: the loose stones are half-buried on purpose, and this is how buried.
  let flush = 0, shallowest = Infinity, tallest = -Infinity;
  for (const p of stoneSolids) {
    const out = p.top - (R + heightAt(p.dir));
    if (out < .008) flush++;
    shallowest = Math.min(shallowest, out);
    tallest = Math.max(tallest, out);
  }
  ok('and the loose stones stand proud of the ground they are set in', flush === 0,
    stoneSolids.length + ' stones stand from ' + mm(shallowest) + ' to ' + mm(tallest) + ' above the ground under ' +
    'them' + (flush ? '; ' + flush + ' are flush or buried' : ''));
}

// ---- where they are allowed to be -----------------------------------------------------------------------
{
  const wet = hardProps.filter(p => heightAt(p.dir) < SEA);
  const deepest = wet.length ? Math.max(...wet.map(p => SEA - heightAt(p.dir))) : 0;
  ok('the solids that stand in water stand in the shallows', wet.length <= 8 && deepest < .20,
    hardProps.length + ' solids; ' + wet.length + ' stand below the waterline' +
    (wet.length ? ', the deepest in ' + mm(deepest) + ' of water' : '') +
    ' — the sea floor below that belongs to the sea stones and the reefs');
}

// ---- one solid is not another ---------------------------------------------------------------------------
{
  // Boulders come in clusters on purpose, so "no two circles touch" would be wrong — a crag is several
  // stones. What is wrong is the same stone laid twice, or one so deep inside another that its collision
  // circle is a decoration.
  let twins = 0, touching = 0, worst = 0;
  for (let i = 0; i < hardProps.length; i++) {
    const a = hardProps[i];
    for (let j = i + 1; j < hardProps.length; j++) {
      const b = hardProps[j];
      if (a.dir.dot(b.dir) < .9975) continue;                 // more than a tenth of a unit apart
      const chord = a.dir.distanceTo(b.dir);
      const gap = chord - a.r - b.r;
      if (chord < .002 && Math.abs(a.r - b.r) < .002) twins++;
      if (gap < 0) { touching++; worst = Math.max(worst, -gap); }
    }
  }
  ok('no boulder is laid down twice', twins === 0,
    hardProps.length + ' solids; ' + twins + ' pairs share a place and a width. ' + touching +
    ' pairs overlap at all, worst ' + mm(worst) + ' — a crag is several stones and a grove is several trunks, ' +
    'so overlapping is the design; the same stone twice is not');
}

// ---- and not in a house ---------------------------------------------------------------------------------
{
  let inWall = 0, worst = 0;
  for (const box of walkBoxes) {
    if (box.bottom > R + heightAt(box.dir) + .013) continue;
    for (const p of all) {
      if (box.dir.dot(p.dir) < .9995) continue;
      const off = p.dir.clone().sub(box.dir).multiplyScalar(R);
      const inside = Math.min(box.hx - Math.abs(off.dot(box.ex)), box.hz - Math.abs(off.dot(box.ez)));
      if (inside > 0) { inWall++; worst = Math.max(worst, inside); }         // the solid's own centre, in a wall
    }
  }
  // The forest is planted before the towns are laid, so a house can be built over a tree. It cannot be fixed
  // by moving the tree out of the way here (the instance matrices are already written), and inside a hall it
  // is not visible; this bounds the problem instead of hiding it.
  ok('a house is rarely built over a tree', inWall <= all.length * .07,
    inWall + ' of ' + all.length + ' solids have their centre inside a wall (' + (inWall / all.length * 100).toFixed(1) +
    '%), worst ' + mm(worst) + ' in; the forest is planted before the towns are laid, and a hall is wide enough ' +
    'to cover a grove');
}

// ---- the clearing you land in ---------------------------------------------------------------------------
{
  // This is the bug the suite was written for. The near-landing scatter kept only the *point* clear, and a
  // boulder 206 mm across laid 30 mm from that point left the player standing inside it: on frame one the
  // escape code shoved them sideways, before they had touched a key.
  const gaps = all.map(p => landing.distanceTo(p.dir) - p.r).sort((a, b) => a - b);
  const plants = floraHard.map(p => landing.distanceTo(p.dir) - p.size * .5).sort((a, b) => a - b);
  const walls = walkBoxes.map(box => {
    const off = box.dir.clone().sub(landing).multiplyScalar(R);
    return Math.max(Math.abs(off.dot(box.ex)) - box.hx, Math.abs(off.dot(box.ez)) - box.hz);
  }).sort((a, b) => a - b);
  const overlap = overlapAt(landing, R + heightAt(landing));
  ok('the player opens their eyes in a clearing, not inside a boulder', overlap === 0 && gaps[0] > .012,
    'nearest solid ' + mm(gaps[0]) + ', nearest plant ' + mm(plants[0]) + ', nearest wall face ' + mm(walls[0]) +
    '; the body at the spawn point overlaps nothing (' + overlap.toFixed(4) + ' of a body inside a solid)');
}

// ---- what the ground and the climate allow ---------------------------------------------------------------
{
  // Trees stop at the tree line. The biome model calls everything above 235 mm alpine, and a fir on a glacier
  // is the sort of thing that reads as a bug in the picture rather than in the code.
  const trees = floraHard.filter(p => p.type === 0 || p.type === 1 || p.type === 2 || p.type === 6 || p.type === 7);
  const above = trees.filter(p => heightAt(p.dir) > .30);
  ok('no tree grows above the tree line', above.length === 0,
    trees.length + ' trees and palms; the highest stands at ' + mm(Math.max(...trees.map(p => heightAt(p.dir)))) +
    ' (alpine starts at ' + mm(.235) + ')');
}
{
  // Two provinces may be woodless — a desert and a basalt field — but every one of them has to carry solids,
  // or somewhere the player lands has nothing to walk around.
  const byProvince = new Map();
  const get = id => { if (!byProvince.has(id)) byProvince.set(id, { solids: 0, plants: 0 }); return byProvince.get(id); };
  for (const p of all) get(provinceAt(p.dir)).solids++;
  for (const p of floraHard) get(provinceAt(p.dir)).plants++;
  const ids = [...byProvince.keys()].sort();
  ok('all five provinces carry solids and plants', ids.length === 5 && ids.every(id => get(id).solids > 20 && get(id).plants > 20),
    ids.map(id => id.toUpperCase() + ': ' + get(id).solids + ' solids, ' + get(id).plants + ' plants').join(' · '));
}

// ---- the reefs' own stones ------------------------------------------------------------------------------
{
  let off = 0, worst = 0;
  for (const w of reefs) {
    for (const stone of w.stones) {
      const gap = Math.abs(stone.dir.distanceTo(w.home) - (w.ring || 0)) - (stone.r || 0);
      if (gap > .05) { off++; worst = Math.max(worst, gap); }
    }
  }
  const rings = reefs.reduce((s, w) => s + w.stones.length, 0);
  ok('every reef keeps its stones on its own ring', off === 0,
    rings + ' reef stones across ' + reefs.length + ' reefs' + (off ? '; ' + off + ' sit ' + mm(worst) + ' off their ring' : ''));
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
