// The spot the user reported: 51.3 N, 14.0 W.
import { buildWorld } from './world.mjs';
const w = await buildWorld();
const { THREE, R, SEA, EYE, heightAt, state, keys, joystick, physicsStep, updateBell, updateReefs, bell, reefs,
  resetGroundMotion, settlementDirs, hardProps, BELL_SIZE } = w;
const n = new THREE.Vector3(Math.sin(-14 * Math.PI / 180) * Math.cos(51.3 * Math.PI / 180),
  Math.sin(51.3 * Math.PI / 180), Math.cos(-14 * Math.PI / 180) * Math.cos(51.3 * Math.PI / 180)).normalize();
console.log('ground at the spot:', (heightAt(n) * 1000).toFixed(1), 'mm (sea', (SEA * 1000).toFixed(0) + ')');
keys.clear(); joystick.x = joystick.y = 0; resetGroundMotion();
state.mode = 'ground'; state.transition = null; state.direction.copy(n); state.water = false;
state.depth = 0; state.swimBlend = 0; state.submerged = false;
state.radius = R + heightAt(n) + EYE; state.velocity = 0; state.grounded = true;
const dt = 1 / 120;
// the herd nearest the spot
const near = bell.map((d, i) => ({ i, gap: d.pos.angleTo(n) * R })).sort((a, b) => a.gap - b.gap).slice(0, 6);
console.log('nearest bells (mm):', near.map(o => o.i + ':' + (o.gap * 1000).toFixed(0)).join('  '));
const start = bell.map(d => d.pos.clone());
const modes = bell.map(() => ({}));
const steps = bell.map(() => 0);
let prev = bell.map(d => d.pos.clone());
for (let f = 0; f < 7200; f++) {
  updateBell(dt, f * dt); updateReefs(dt, f * dt); physicsStep(dt);
  bell.forEach((d, i) => {
    if (d.awake) modes[i][d.mode] = (modes[i][d.mode] || 0) + 1;
  });
  prev.forEach((p, i) => { steps[i] = Math.max(steps[i], p.angleTo(bell[i].pos) * R); p.copy(bell[i].pos); });
}
for (const o of near) {
  const d = bell[o.i];
  console.log(o.i, 'awake', d.awake, 'moved', (start[o.i].angleTo(d.pos) * R * 1000).toFixed(1), 'mm',
    'biggest step', (steps[o.i] * 1000).toFixed(2), 'mm', 'modes', JSON.stringify(modes[o.i]));
}
// what is around the nearest one?
const d = bell[near[0].i];
for (const [i, s] of settlementDirs.entries()) {
  const gap = s.dir.angleTo(d.pos) * R - (s.wr || .20);
  if (gap < .12) console.log('settlement', i, 'edge gap', (gap * 1000).toFixed(1), 'mm');
}
for (const p of hardProps) {
  if (p.dir.dot(d.pos) < .99) continue;
  const gap = p.dir.distanceTo(d.pos) * R - p.r - d.hit.r;
  if (gap < .05) console.log('prop gap', (gap * 1000).toFixed(1), 'mm  r', (p.r * 1000).toFixed(0), 'top', p.top === undefined ? '-' : ((p.top - R) * 1000).toFixed(0));
}
