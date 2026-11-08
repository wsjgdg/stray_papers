// Collision cache and adversarial approaches at the page's low-frame-rate limit. This uses actual animal
// updates, actual collision records and the whole built world; only the two test posts are inserted here.
import { buildWorld } from './world.mjs';

const w = await buildWorld();
const { THREE, R, SEA, EYE, heightAt, bell, state, keys, joystick, hardProps, stoneSolids,
  updateBell, refreshBellProps, dressStones, resetGroundMotion, seeded } = w;
let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';

// The page's initial dressed stones already exist when the herd is placed. Test before adding any synthetic
// posts or advancing an animal; a spawn in a rock must not be hidden by a subsequent relaxation pass.
let spawnGap = Infinity;
for (const a of bell) for (const list of [hardProps, stoneSolids]) for (const p of list) {
  if (p.top !== undefined && p.top <= R + heightAt(a.pos)) continue;
  spawnGap = Math.min(spawnGap, a.pos.distanceTo(p.dir) * R - a.hit.r - p.r);
}
ok('animals initially spawn outside trees, boulders and dressed stones', spawnGap >= 0,
  'closest world-chord edge clearance ' + mm(spawnGap));

// The walker is 1.2 world units away, still inside the wake radius, not at the animal's feet. The cache
// must be local to the animal rather than silently omitting props that are far from the player.
const animal = bell[0];
const side = new THREE.Vector3(1, 0, 0).cross(animal.pos).normalize();
const player = animal.pos.clone().addScaledVector(side, 1.2 / R).normalize();
resetGroundMotion(); keys.clear(); joystick.x = joystick.y = 0;
state.mode = 'ground'; state.transition = null; state.ghost = false; state.direction.copy(player);
state.radius = R + Math.max(heightAt(player), SEA) + EYE; state.feetRadius = R + heightAt(player);
state.velocity = 0; state.grounded = true; state.water = false; state.depth = 0; state.swimBlend = 0;
const forward = animal.fwd.clone();
const centre = animal.pos.clone().addScaledVector(forward, .10 / R).normalize();
const trunk = { dir: centre.clone(), r: .027 };
const rock = { dir: centre.clone(), r: .032, top: R + heightAt(centre) + .10 };
hardProps.push(trunk); stoneSolids.push(rock);
refreshBellProps();
ok('a distant awake animal sees its own nearby props and the actual stone record',
  animal.pos.distanceTo(player) * R > 1.1 && animal.near.includes(trunk) && animal.near.includes(rock) &&
  animal.near.find(p => p === rock).r === .032,
  'player ' + mm(animal.pos.distanceTo(player) * R) + ' away; both inserted records retained by identity, stone radius ' + mm(rock.r));

// Ground dressing replaces the entire array. Even when the periodic timer has not expired, the next update
// must discard the old objects and pick up the new stones, or an animal can walk into an invisible stale cache.
const old = new Set(stoneSolids);
dressStones(animal.pos, seeded(82341));
updateBell(.001, 0);
const current = stoneSolids.filter(p => p.dir.distanceTo(animal.pos) * R < p.r + .44);
const stale = animal.near.filter(p => old.has(p) && !stoneSolids.includes(p));
const missed = current.filter(p => !animal.near.includes(p));
ok('re-dressing invalidates the stone cache on the next update', stale.length === 0 && missed.length === 0 && current.length > 0,
  current.length + ' nearby new stones, ' + stale.length + ' stale and ' + missed.length + ' missing');

// Drive the animal towards a new rock at 20 Hz (dt=.05, the same cap as the page), repeatedly asking it to
// walk to the other side. A stale/oversized stone record or an unguarded coasting step shows up as a negative
// edge-to-edge gap; merely sleeping or freezing in place does not count as successful avoidance.
hardProps.splice(hardProps.indexOf(trunk), 1);
const start = animal.pos.clone(), dir = animal.fwd.clone().addScaledVector(animal.pos, -animal.fwd.dot(animal.pos)).normalize();
const obstacleDir = start.clone().addScaledVector(dir, .11 / R).normalize();
const obstacle = { dir: obstacleDir, r: .030, top: R + heightAt(obstacleDir) + .10 };
stoneSolids.push(obstacle);
refreshBellProps();
const goal = start.clone().addScaledVector(dir, .30 / R).normalize();
const initial = start.distanceTo(obstacle.dir) * R - obstacle.r - animal.hit.r;
let closest = initial, travelled = 0, prev = start.clone();
for (let f = 0; f < 20 * 10; f++) {
  animal.mode = 'walk'; animal.timer = 1; animal.goto.copy(goal);
  updateBell(.05, f * .05);
  closest = Math.min(closest, animal.pos.distanceTo(obstacle.dir) * R - obstacle.r - animal.hit.r);
  travelled += prev.distanceTo(animal.pos) * R; prev.copy(animal.pos);
}
ok('at 20 Hz an animal approaches and avoids a correctly sized stone without freezing',
  closest > -.002 && travelled > .025 && closest < initial - .005,
  'initial gap ' + mm(initial) + ', closest ' + mm(closest) + ', total travel ' + mm(travelled));

// The same footprint check after the adversarial moving-herd scenario.
let worst = Infinity;
for (const a of bell) for (const list of [hardProps, stoneSolids]) for (const p of list) {
  if (p.top !== undefined && p.top <= R + heightAt(a.pos)) continue;
  worst = Math.min(worst, a.pos.distanceTo(p.dir) * R - a.hit.r - p.r);
}
// This last measurement is after ten seconds of active movement rather than only at initial placement.
ok('the active herd is not embedded in the current collision posts', worst >= -.002,
  'closest world-chord clearance after the low-rate test ' + mm(worst));

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
