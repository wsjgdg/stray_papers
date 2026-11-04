// The first herd must be real, reasonably close, and still outside the protected landing. Build the
// unmodified page twice and read its actual animals, collision posts and instanced body matrices.
// A chord distance is not a sightline: the route exercise below reports water rather than claiming a dry view.
import { buildWorld } from './world.mjs';

let pass = 0, fail = 0;
const ok = (name, condition, info = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = value => (value * 1000).toFixed(1) + ' mm';

for (const [label, options] of [['desktop', {}], ['compact', { width: 390, height: 844 }]]) {
  const w = await buildWorld(options);
  const { THREE, R, SEA, EYE, WALKER_RADIUS, landing, nearDirection, bell, bellBodyMesh, heightAt, provinceAt,
    bellRough, settlementDirs, hardProps, stoneSolids, overlapAt, state, keys, joystick,
    physicsStep, updateBell, resetGroundMotion } = w;
  const grouped = [];
  for (const animal of bell) {
    let group = grouped.find(g => g.home.distanceTo(animal.home) < 1e-9);
    if (!group) { group = { home: animal.home.clone(), animals: [] }; grouped.push(group); }
    group.animals.push(animal);
  }
  // The first pack is the one the fixed-seed page marks as near for its green landing province.
  // Inspect its actual shared home, rather than passing because an unrelated random pack happens to be close.
  const group = grouped.find(g => g.animals.includes(bell[0]));
  const homeDistance = group ? group.home.distanceTo(landing) * R : Infinity;
  ok(label + ': the actual first group has a nearby, sufficiently level home',
    !!group && group.animals.length >= 3 && homeDistance <= 1.6 && bellRough(group.home, 1) < .008,
    group ? group.animals.length + ' animals share a home ' + mm(homeDistance) +
      ' from landing, stance roughness ' + mm(bellRough(group.home, 1)) : 'no first group');

  const nearest = bell.map((animal, index) => ({ animal, index,
    edge: animal.pos.distanceTo(landing) * R - animal.hit.r })).sort((a, b) => a.edge - b.edge)[0];
  const lowestEdge = nearest ? nearest.edge : -Infinity;
  let nearestPair = Infinity;
  for (let i = 0; i < bell.length; i++) for (let j = i + 1; j < bell.length; j++) {
    nearestPair = Math.min(nearestPair, bell[i].pos.distanceTo(bell[j].pos) * R - bell[i].hit.r - bell[j].hit.r);
  }
  ok(label + ': real animal bodies stay outside the clearing and one another',
    lowestEdge >= .12 * R - 1e-6 && nearestPair >= -1e-6,
    'nearest edge ' + mm(lowestEdge) + ' (clearing ' + mm(.12 * R) + '); nearest pair gap ' + mm(nearestPair));

  const members = group?.animals || [];
  const matrix = new THREE.Matrix4(), drawn = new THREE.Vector3();
  let worstDrawn = 0, worstPropGap = Infinity, worstTownGap = Infinity, dry = true, sameProvince = true;
  for (const d of members) {
    bellBodyMesh.getMatrixAt(bell.indexOf(d), matrix);
    drawn.setFromMatrixPosition(matrix);
    worstDrawn = Math.max(worstDrawn, drawn.distanceTo(d.world));
    dry = dry && heightAt(d.pos) > SEA + .008 - 1e-9;
    sameProvince = sameProvince && provinceAt(d.pos) === provinceAt(group.home);
    for (const p of [...hardProps, ...stoneSolids]) worstPropGap = Math.min(worstPropGap,
      d.pos.distanceTo(p.dir) * R - d.hit.r - p.r);
    for (const site of settlementDirs) worstTownGap = Math.min(worstTownGap,
      d.pos.angleTo(site.dir) * R - (site.wr || .20) - d.hit.r);
  }
  ok(label + ': nearby animals are drawn, dry and clear of actual solids and town footprints',
    members.length >= 3 && dry && sameProvince && worstDrawn < 1e-5 && worstPropGap > -.001 && worstTownGap > 0,
    members.length + ' body matrices, worst drawing mismatch ' + mm(worstDrawn) +
      ', prop gap ' + mm(worstPropGap) + ', town gap ' + mm(worstTownGap));

  // Steer along the great-circle bearing to the nearest animal's *initial* location. Run the same
  // physics-then-herd order as the page; the animal remains free to notice the player and move away.
  // This is a controlled route, not proof of a clear line of sight or of an all-land path.
  if (!nearest || lowestEdge > 1.6) {
    ok(label + ': a steered approach reaches a responding nearby animal', false, 'nearest animal is too far for this route');
    continue;
  }
  const target = nearest.animal, initial = target.pos.clone();
  resetGroundMotion(); keys.clear();
  state.mode = 'ground'; state.transition = null; state.direction.copy(landing);
  state.radius = R + heightAt(landing) + EYE; state.feetRadius = R + heightAt(landing);
  state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
  state.velocity = 0; state.grounded = true; state.moveVelocity.set(0, 0, 0);
  keys.add('KeyW');
  let bestSite = Infinity, bestGap = Infinity, awake = 0, reacted = 0, wet = 0;
  for (let f = 0; f < 120 * 6; f++) {
    const heading = initial.clone().addScaledVector(state.direction, -initial.dot(state.direction));
    if (heading.lengthSq() > 1e-12) state.heading.copy(heading.normalize());
    physicsStep(1 / 120);
    updateBell(1 / 120, f / 120);
    bestSite = Math.min(bestSite, state.direction.distanceTo(initial) * R);
    bestGap = Math.min(bestGap, state.direction.distanceTo(target.pos) * R - target.hit.r - WALKER_RADIUS);
    awake += Number(target.awake);
    reacted += Number(target.mode === 'alert' || target.mode === 'flee');
    wet += Number(state.water);
  }
  keys.clear();
  ok(label + ': a steered approach reaches a responding nearby animal',
    bestSite < .08 && bestGap < .08 && bestGap > -.002 && awake > 0 && reacted > 0,
    'nearest to its initial site ' + mm(bestSite) + ', closest body gap ' + mm(bestGap) +
      ', ' + reacted + ' alert/flee frames; ' + wet + '/720 water frames');

  // Find a *candidate* dry path to that original site on a small 30 mm grid, rejecting the page's
  // own solid overlap and a margin above the waterline. Grid connectivity by itself is not enough:
  // walk the resulting route through the actual continuous physics and count every wet step. The
  // animal is still live and may have moved away, so this proves a route to its starting location,
  // not that a player can see or meet it there.
  const limit = 2.2, step = .030, side = Math.ceil(limit * 2 / step) + 1, mid = Math.floor(side / 2);
  const count = side * side, dirs = new Array(count), passable = new Uint8Array(count);
  const previous = new Int32Array(count).fill(-1), queue = new Int32Array(count);
  for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
    const dx = (x - mid) * step, dz = (z - mid) * step, distance = Math.hypot(dx, dz);
    if (distance > limit) continue;
    const id = z * side + x, dir = nearDirection(landing, Math.atan2(dz, dx), distance / R);
    const h = heightAt(dir);
    dirs[id] = dir;
    if (h > SEA + .012 && overlapAt(dir, R + h) < 1e-8) passable[id] = 1;
  }
  const root = mid * side + mid;
  let front = 0, back = 0;
  if (passable[root]) { previous[root] = root; queue[back++] = root; }
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (; front < back; front++) {
    const id = queue[front], x = id % side, z = Math.floor(id / side);
    for (const [dx, dz] of steps) {
      const xx = x + dx, zz = z + dz;
      if (xx < 0 || zz < 0 || xx >= side || zz >= side) continue;
      const next = zz * side + xx;
      if (!passable[next] || previous[next] !== -1 ||
          (dx && dz && (!passable[z * side + xx] || !passable[zz * side + x]))) continue;
      previous[next] = id; queue[back++] = next;
    }
  }
  let goal = -1, gridGap = Infinity;
  for (let i = 0; i < count; i++) if (previous[i] >= 0) {
    const distance = dirs[i].distanceTo(initial) * R;
    if (distance < gridGap) { gridGap = distance; goal = i; }
  }
  if (goal < 0 || gridGap > .04) {
    ok(label + ': a steered dry route reaches the original animal site', false,
      'no candidate path within 40 mm (grid gap ' + mm(gridGap) + ')');
    continue;
  }
  const path = [];
  for (let id = goal; id !== root; id = previous[id]) path.push(dirs[id]);
  path.reverse();
  resetGroundMotion(); keys.clear();
  state.direction.copy(landing); state.radius = R + heightAt(landing) + EYE;
  state.feetRadius = R + heightAt(landing); state.water = false; state.depth = 0;
  state.swimBlend = 0; state.submerged = false; state.crouch = 0; state.velocity = 0;
  state.grounded = true; state.moveVelocity.set(0, 0, 0);
  joystick.y = -.20; // real analogue input, slow enough to follow the grid's turns
  let waypoint = 0, wetSteps = 0, frames = 0, closestSite = Infinity, minDry = Infinity;
  for (; frames < 120 * 70 && waypoint < path.length; frames++) {
    while (waypoint < path.length && state.direction.distanceTo(path[waypoint]) * R < step * .58) waypoint++;
    if (waypoint >= path.length) break;
    const aim = path[waypoint], heading = aim.clone().addScaledVector(state.direction, -aim.dot(state.direction));
    if (heading.lengthSq() > 1e-12) state.heading.copy(heading.normalize());
    physicsStep(1 / 120); updateBell(1 / 120, 6 + frames / 120);
    wetSteps += Number(state.water);
    minDry = Math.min(minDry, heightAt(state.direction) - SEA);
    closestSite = Math.min(closestSite, state.direction.distanceTo(initial) * R);
  }
  joystick.y = 0;
  ok(label + ': a steered dry route reaches the original animal site',
    waypoint === path.length && closestSite < .04 && wetSteps === 0 && minDry > 0,
    'reached ' + waypoint + '/' + path.length + ' waypoints in ' + (frames / 120).toFixed(1) +
      ' s; site gap ' + mm(closestSite) + ', water frames ' + wetSteps + ', minimum ground above sea ' + mm(minDry));
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
