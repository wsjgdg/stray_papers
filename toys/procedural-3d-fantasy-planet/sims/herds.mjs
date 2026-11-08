// Every herd on the planet, one after another, with the walker standing among it: which animals move, which
// do not, and what is in the way of the ones that do not.
import { buildWorld } from './world.mjs';
const w = await buildWorld();
const { THREE, R, SEA, EYE, heightAt, state, keys, joystick, physicsStep, updateBell, updateReefs, bell, reefs,
  resetGroundMotion, settlementDirs, hardProps, stoneSolids, propAhead, WALKER_RADIUS } = w;
const dt = 1 / 120;
// herd by herd: a herd is a cluster of bells whose homes are within .05 of each other
const herds = [];
for (const d of bell) {
  let h = herds.find(g => g.home.angleTo(d.home) * R < .05);
  if (!h) { h = { home: d.home.clone(), members: [] }; herds.push(h); }
  h.members.push(d);
}
console.log(herds.length, 'herds:', herds.map(h => h.members.length).join(' '));
let stuckCount = 0;
for (const [h, herd] of herds.entries()) {
  const spot = herd.home.clone();
  keys.clear(); joystick.x = joystick.y = 0; resetGroundMotion();
  state.mode = 'ground'; state.transition = null; state.direction.copy(spot); state.water = false;
  state.depth = 0; state.swimBlend = 0; state.submerged = false;
  state.radius = R + heightAt(spot) + EYE; state.velocity = 0; state.grounded = true;
  const prev = herd.members.map(d => d.pos.clone());
  const start = herd.members.map(d => d.pos.clone());
  const walkFrames = herd.members.map(() => 0);
  const walkStill = herd.members.map(() => 0);
  const still = herd.members.map(() => 0);
  const longestStill = herd.members.map(() => 0);
  for (let f = 0; f < 7200; f++) {
    updateBell(dt, f * dt); updateReefs(dt, f * dt); physicsStep(dt);
    herd.members.forEach((d, i) => {
      const step = prev[i].angleTo(d.pos) * R;
      if (d.mode === 'walk') { walkFrames[i]++; if (step < 5e-5) walkStill[i]++; }
      // what the eye sees: a body that has not moved a millimetre for seconds on end, whatever the mode
      if (d.awake) { still[i] = step < 1e-6 ? still[i] + 1 : 0; longestStill[i] = Math.max(longestStill[i], still[i]); }
      else still[i] = 0;
      prev[i].copy(d.pos);
    });
  }
  const report = herd.members.map((d, i) => ({ d, i, still: walkStill[i], walk: walkFrames[i], gone: start[i].angleTo(d.pos) * R }));
  const worst = Math.max(...longestStill) / 120;
  const bad = herd.members.map((d, i) => ({ d, i, still: longestStill[i] })).filter(o => o.still > 120 * 6);
  console.log('herd', h, 'moved(mm)', report.map(o => (o.gone * 1000).toFixed(0)).join('/'),
    'longest still(s)', (longestStill.map(v => (v / 120).toFixed(1)).join('/')), bad.length ? '<== FROZEN ' + worst.toFixed(1) + 's' : '');
  for (const o of bad) {
    stuckCount++;
    const d = o.d;
    const dirs = [];
    for (let k = 0; k < 12; k++) {
      const dir = d.fwd.clone().applyAxisAngle(d.pos, k * Math.PI / 6).normalize();
      dirs.push((propAhead(d, .010, dir) ? 'x' : '.') + (propAhead(d, .038, dir) ? 'X' : 'o'));
    }
    const near = [];
    for (const p of [...hardProps, ...stoneSolids]) {
      if (p.dir.dot(d.pos) < .995) continue;
      const gap = p.dir.distanceTo(d.pos) * R - p.r - d.hit.r;
      if (gap < .03) near.push((gap * 1000).toFixed(1) + '/r' + (p.r * 1000).toFixed(0) + (p.top === undefined ? '' : '/t' + ((p.top - R) * 1000).toFixed(0)));
    }
    const settle = settlementDirs.map(s => (s.dir.angleTo(d.pos) * R - (s.wr || .20)) * 1000).filter(g => g < 120).map(g => g.toFixed(0));
    console.log('   animal', o.i, 'mode', d.mode, 'probes(.010/.038)', dirs.join(' '), 'ground(mm)', (heightAt(d.pos) * 1000).toFixed(0),
      'props', near.join(',') || 'none', 'settlements(mm)', settle.join(',') || 'none', 'targetSpeed', d.speed.toFixed(3), 'vel', d.vel.toFixed(3));
  }
}
console.log('stuck animals total', stuckCount);
