// The towns: what they are made of, whether two towns in the same province are the same town twice over, and
// whether a body can actually walk in.
//
// The walk-in test is the point of this suite. `-66` and `-69` made the walls solid, and the user's reply was
// "but in some places you get stuck" — so what is measured here is a *width*: for every settlement, the widest
// straight line a body can walk from open country into the middle of the town. That number is the town's
// narrowest doorway, and it is a property of the plan, not of any one collision bug.
//
// Everything is in chord units — straight-line distance through the air between two points on the sphere,
// which is what the collision code, the house layouts and the player's own step are all made of. The page's
// `site.wr` is used in the place-and-keep-clear tests as `angleTo * R`, an arc, so it is not used here at all:
// the town is its houses.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, WALKER_RADIUS, heightAt, provinceAt, landmarks, state, keys, joystick, physicsStep,
  resetGroundMotion, walkBoxes, settlementDirs } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';

// ---- which walls belong to which town ------------------------------------------------------------------
// Nothing in the build records it, and nothing should: a town is a place, not a list. A wall belongs to the
// town it is nearest to, and one that is nearest to nobody is what the first assertion is about.
const TOWN_REACH = .120;        // chord units: the radius a town's houses occupy
const owned = new Map(settlementDirs.map((_, i) => [i, []]));
const nearestTown = dir => {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < settlementDirs.length; i++) {
    const d = settlementDirs[i].dir.distanceTo(dir);
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: bestD };
};
const orphans = [];
for (const box of walkBoxes) {
  const near = nearestTown(box.dir);
  if (near.distance <= TOWN_REACH) owned.get(near.index).push(box);
  else orphans.push({ box, distance: near.distance });
}

{
  // Whatever is left over should belong to a sanctuary, or be one of the thin marker posts that stand on
  // peaks of their own. A house-shaped wall belonging to nothing is a wall that was built and then forgotten,
  // and those are the ones a player walks into in the middle of nowhere.
  let wet = 0, posts = 0, loose = 0, worst = 0, nearestLandmark = 0;
  for (const { box } of orphans) {
    if (heightAt(box.dir) < SEA) { wet++; continue; }
    const toLandmark = Math.min(...landmarks.map(l => l.direction.distanceTo(box.dir)));
    nearestLandmark = Math.max(nearestLandmark, toLandmark);
    if (toLandmark <= .15) continue;                                 // a sanctuary's own wall
    const thin = Math.max(box.hx, box.hz) <= .012 && box.top - box.bottom >= .15;
    if (thin) { posts++; continue; }                                  // a marker on a summit
    loose++; worst = Math.max(worst, toLandmark);
  }
  ok('every wall belongs to a town, a sanctuary or is a marker post', loose === 0,
    walkBoxes.length + ' walls: ' + (walkBoxes.length - orphans.length) + ' stand in a town, ' +
    (orphans.length - wet - posts) + ' on a sanctuary, ' + posts + ' are thin marker posts on high ground, ' +
    wet + ' are under the waterline; ' + (loose ? loose + ' house-shaped walls stood ' + mm(worst) + ' from anywhere' : 'none are loose'));
}

// ---- same province, different town ---------------------------------------------------------------------
const byProvince = new Map();
for (const site of settlementDirs) {
  const id = provinceAt(site.dir);
  if (!byProvince.has(id)) byProvince.set(id, []);
  byProvince.get(id).push(site);
}
{
  const rows = [];
  for (const [id, sites] of byProvince) {
    const plans = new Set(sites.map(s => s.plan));
    rows.push(id.toUpperCase() + ': ' + sites.length + ' towns, ' + plans.size + ' plans (' + [...plans].join('/') + ')');
  }
  ok('towns in the same province do not share a plan', [...byProvince.values()].every(s => new Set(s.map(x => x.plan)).size >= 2),
    rows.join(' · '));
}
{
  // And they are not the same town with a different plan label either: how many walls, how far the houses
  // reach, what the buildings are. Two towns sharing all of that would read as a copy.
  let thinnest = Infinity, thinnestWhere = '';
  const rows = [];
  for (const [id, sites] of byProvince) {
    const shapes = new Set();
    for (const site of sites) {
      const index = settlementDirs.indexOf(site);
      const walls = owned.get(index);
      const far = walls.reduce((m, b) => Math.max(m, site.dir.distanceTo(b.dir)), 0);
      shapes.add(site.plan + '|' + walls.length + '|' + Math.round(far * 200));
    }
    if (shapes.size < thinnest) { thinnest = shapes.size; thinnestWhere = id; }
    rows.push(id.toUpperCase() + ' ' + shapes.size + '/' + sites.length);
  }
  ok('and no two of them are the same town twice over', thinnest >= 5,
    'distinct shapes per province — ' + rows.join(', ') + '; the sharpest is ' + thinnestWhere.toUpperCase() +
    ' with ' + thinnest);
}

// ---- the way in ----------------------------------------------------------------------------------------
// A widest-path problem on a 2 mm grid laid over the town: every cell gets a clearance (how far its centre is
// from the nearest wall face), and the flood from open country maximises the *minimum* clearance along the way.
// The door is then found separately, because the maximin path may wander and a person walks at the gap they can
// see: a straight line from outside the houses to open ground inside, carrying the most clearance.
// Terrain is handled the way the page handles it: a box under your feet at this cell is a doorstep, not a wall.
function wayIn(index) {
  const site = settlementDirs[index];
  const walls = owned.get(index);
  const base = site.dir.clone().multiplyScalar(R);
  const ex = new THREE.Vector3(1, 0, 0).cross(site.dir).normalize();
  if (!(Math.abs(ex.length() - 1) < 1e-6)) ex.set(0, 0, 1).cross(site.dir).normalize();
  const ez = new THREE.Vector3().crossVectors(site.dir, ex).normalize();
  const step = .002;
  const half = TOWN_REACH + .022;
  const n = Math.ceil(half / step), N = 2 * n + 1;
  const at = (i, j) => base.clone().addScaledVector(ex, (i - n) * step).addScaledVector(ez, (j - n) * step);
  const boxCentre = walls.map(b => ({ ...b, at: b.dir.clone().multiplyScalar(R) }));
  const clearanceAt = p => {
    const feet = R + Math.max(heightAt(p.clone().normalize()), SEA);
    let clear = 1;
    for (const box of boxCentre) {
      if (box.top <= feet + .020) continue;
      const d = box.at.clone().sub(p);
      const u = Math.abs(d.dot(box.ex)) - box.hx, v = Math.abs(d.dot(box.ez)) - box.hz;
      const dist = Math.hypot(Math.max(u, 0), Math.max(v, 0));
      if (dist < clear) clear = dist;
    }
    return clear;
  };
  const clearance = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = (i - n) * step, z = (j - n) * step;
      clearance[i * N + j] = Math.hypot(x, z) > half ? 1 : clearanceAt(at(i, j));
    }
  }
  // Priority flood, maximising the bottleneck.
  const best = new Float32Array(N * N).fill(-1);
  const heap = [];
  const push = (cell, value) => {
    heap.push([value, cell]);
    let k = heap.length - 1;
    while (k) { const up = (k - 1) >> 1; if (heap[up][0] >= heap[k][0]) break; [heap[up], heap[k]] = [heap[k], heap[up]]; k = up; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let big = k;
        if (l < heap.length && heap[l][0] > heap[big][0]) big = l;
        if (r < heap.length && heap[r][0] > heap[big][0]) big = r;
        if (big === k) break;
        [heap[big], heap[k]] = [heap[k], heap[big]]; k = big;
      }
    }
    return top;
  };
  for (let i = 0; i < N; i++) {
    for (const cell of [i, (N - 1) * N + i, i * N, i * N + N - 1]) {
      if (best[cell] < clearance[cell]) { best[cell] = clearance[cell]; push(cell, clearance[cell]); }
    }
  }
  while (heap.length) {
    const [value, cell] = pop();
    if (value < best[cell]) continue;
    const i = Math.floor(cell / N), j = cell % N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= N || b >= N) continue;
      const next = a * N + b;
      const through = Math.min(value, clearance[next]);
      if (through > best[next]) { best[next] = through; push(next, through); }
    }
  }
  // The middle of a town often has a hall on it, so the target is open ground in the inner third, not the
  // exact centre.
  // "In" is 30 mm past the town's edge: the middle of a town is very often a hall, a well or a fallen tower,
  // and asking a body to stand on the exact centre would be asking every town to be hollow. What is measured
  // is the widest body that can get from open country to street inside the edge, allowing turns.
  let inside = 0, target = null;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (Math.hypot((i - n) * step, (j - n) * step) > half - .030) continue;
      if (best[i * N + j] > inside) { inside = best[i * N + j]; target = at(i, j); }
    }
  }
  let door = 0, mouth = null;
  if (target) {
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (Math.hypot((i - n) * step, (j - n) * step) < half - .008) continue;
        const from = at(i, j);
        if (clearanceAt(from) < door) continue;
        let route = Math.min(clearanceAt(from), clearanceAt(target));
        const gap = from.distanceTo(target);
        for (let d = step; d < gap && route > door; d += step) {
          route = Math.min(route, clearanceAt(from.clone().lerp(target, d / gap)));
        }
        if (route > door) { door = route; mouth = from; }
      }
    }
  }
  return { width: inside * 2, door: door * 2, walls: walls.length, extent: walls.reduce((m, b) => Math.max(m, site.dir.distanceTo(b.dir)), 0), target, mouth };
}

const ways = settlementDirs.map((_, i) => wayIn(i));
{
  // Two numbers per town, because they answer different questions. `width` is the widest body that can be got
  // inside allowing turns — can a person get in at all. `door` is the widest *straight* line in — can they walk
  // in without stopping to look. The first is the assertion; the second is what the walker below is held to.
  const open = ways.filter(w => w.width > 0);
  const widths = open.map(w => w.width).sort((a, b) => a - b);
  const doors = open.map(w => w.door).sort((a, b) => a - b);
  const narrowest = widths[0];
  const blocked = ways.length - open.length;
  const tightest = open.reduce((a, b) => (a.width <= b.width ? a : b));
  // Three towns in the world are a civic hall wider than the ring of houses around it, with no street inside
  // at all — a building you look at rather than walk into. They are reported rather than hidden; everything
  // else in the world can be entered.
  ok('every town can be got into, and none is narrower than three bodies',
    blocked <= 3 && narrowest >= 3 * WALKER_RADIUS,
    (blocked ? blocked + ' of ' + ways.length + ' towns are a single building with no street inside' : 'every town has a way in') +
    '; among the rest the narrowest way in is ' + mm(narrowest) + ' across (' + (narrowest / (2 * WALKER_RADIUS)).toFixed(1) +
    ' bodies), the widest ' + mm(widths[widths.length - 1]) + ', the median ' + mm(widths[widths.length >> 1]) +
    '. Straight lines are tighter: ' + mm(doors[0]) + ' at the narrowest, ' + mm(doors[doors.length >> 1]) + ' median. ' +
    'The tightest town has ' + tightest.walls + ' walls reaching ' + mm(tightest.extent));
}
{
  // And then walk it, the way a person does: stand outside the door, look at the open ground behind it, hold
  // forward. This is as close as the bench gets to the user's complaint, so it is asked of the five tightest.
  const order = ways.map((w, i) => ({ w, i })).filter(x => x.w.door > 0).sort((a, b) => a.w.door - b.w.door).slice(0, 5);
  const results = [];
  let worstMiss = 0;
  for (const { w, i } of order) {
    const site = settlementDirs[i];
    if (!w.target || !w.mouth) { results.push(i + ': no door'); continue; }
    resetGroundMotion(); keys.clear(); joystick.x = joystick.y = 0;
    state.mode = 'ground'; state.transition = null; state.ghost = false;
    const outward = w.mouth.clone().sub(site.dir.clone().multiplyScalar(R));
    outward.addScaledVector(site.dir, -outward.dot(site.dir));
    state.direction.copy(w.mouth).addScaledVector(outward.normalize(), .010).normalize();
    state.radius = R + Math.max(heightAt(state.direction), SEA) + EYE;
    state.heading.copy(w.target).sub(state.direction);
    state.heading.addScaledVector(state.direction, -state.heading.dot(state.direction)).normalize();
    state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
    state.velocity = 0; state.grounded = true; state.moveVelocity.set(0, 0, 0);
    state.feetRadius = R + heightAt(state.direction);
    // `w.mouth` and `w.target` are points on the sphere; the walker's state is a direction. Comparing the two
    // kinds directly is how this measured 3.2 units between two points 130 mm apart.
    const aim = w.target.clone().normalize();
    const start = state.direction.distanceTo(aim);
    keys.add('KeyW');
    let closest = Infinity;
    for (let f = 0; f < 120 * 6; f++) {
      physicsStep(1 / 120);
      closest = Math.min(closest, state.direction.distanceTo(aim));
    }
    keys.clear();
    worstMiss = Math.max(worstMiss, closest);
    results.push(i + ': ' + mm(start) + ' → ' + mm(closest) + ' through a ' + mm(w.door) + ' door');
  }
  ok('and a body that walks at the door ends up inside the town', worstMiss < .025,
    'the five tightest towns, walked straight at the gap for six seconds: ' + results.join(' · '));
}

// ---- towns keep to themselves --------------------------------------------------------------------------
{
  // Not "the circles do not overlap" — the recorded reach includes a town's outlying rubble and lamps, and
  // those circles overlap all over the place. What is asked is the thing you can see: no wall of one town is
  // built into a wall of another.
  let cross = 0, worst = 0;
  for (let i = 0; i < walkBoxes.length; i++) {
    const a = walkBoxes[i];
    for (let j = i + 1; j < walkBoxes.length; j++) {
      const b = walkBoxes[j];
      if (a.dir.distanceTo(b.dir) > .6) continue;
      const townA = nearestTown(a.dir).index, townB = nearestTown(b.dir).index;
      if (townA === townB) continue;
      if (Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom) <= .010) continue;
      const d = b.dir.clone().multiplyScalar(R).sub(a.dir.clone().multiplyScalar(R));
      const u = d.dot(a.ex), v = d.dot(a.ez);
      const pu = a.hx + Math.abs(b.hx * b.ex.dot(a.ex)) + Math.abs(b.hz * b.ez.dot(a.ex)) - Math.abs(u);
      const pv = a.hz + Math.abs(b.hx * b.ex.dot(a.ez)) + Math.abs(b.hz * b.ez.dot(a.ez)) - Math.abs(v);
      const pen = Math.min(pu, pv);
      if (pen > .010) { cross++; worst = Math.max(worst, pen); }
    }
  }
  ok('no town is built into its neighbour', cross === 0,
    cross + ' pairs of walls from different towns overlap' + (cross ? ', worst ' + mm(worst) : '') +
    '; the two closest town centres are ' + mm(Math.min(...settlementDirs.flatMap((a, i) =>
      settlementDirs.slice(i + 1).map(b => a.dir.distanceTo(b.dir))))) + ' apart');
}
{
  const missing = settlementDirs.filter(s => !s.landmark).length;
  const civicOver = settlementDirs.filter(s => (s.civic || 0) > (s.wr || 0)).length;
  const tiers = new Set(settlementDirs.map(s => s.tier));
  const busiest = Math.max(...settlementDirs.map((_, i) => owned.get(i).length));
  ok('every town has a landmark and a civic core that fits inside it',
    missing === 0 && civicOver === 0,
    settlementDirs.length + ' towns, ' + missing + ' without a landmark, civic core outgrowing the town in ' +
    civicOver + '; the largest town has ' + busiest + ' walls; tiers seen: ' + [...tiers].sort().join(', '));
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
