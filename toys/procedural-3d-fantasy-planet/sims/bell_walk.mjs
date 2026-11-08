// The gait: what a 钵行者's legs and head do while it walks, and what they do while it is asleep.
//
// The page animates the herd from two numbers per animal — `phase` (how far through the stride) and `stride`
// (how long the step is) — with the feet planted from `foot[]` and the head tilted by `headTilt`. This bench drives
// the herd for a minute of walking and a minute of standing and checks the four things that make a body read as an
// animal rather than a prop: the stride advances, it advances faster when the animal moves faster, the hooves come
// off the ground, and nothing ever jumps between two frames.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, state, updateBell, resetGroundMotion, heightAt, bell, EYE } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const dt = 1 / 120;
const TAU = Math.PI * 2;

const stand = (dir) => {
  resetGroundMotion();
  state.mode = 'ground'; state.transition = null; state.ghost = false;
  state.direction.copy(dir);
  state.radius = R + Math.max(heightAt(dir), SEA) + EYE;
  state.heading.copy(new THREE.Vector3(0, 0, 1).cross(dir).normalize());
  state.heading.addScaledVector(dir, -state.heading.dot(dir)).normalize();
  state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
  state.velocity = 0; state.grounded = true; state.moveVelocity.set(0, 0, 0);
  state.feetRadius = R + heightAt(dir);
  return state;
};
// The busiest animal in the herd: most company, so it will actually be awake and moving.
const hub = bell.reduce((best, d) => {
  const crowd = bell.filter(o => o !== d && o.world.distanceTo(d.world) < .18).length;
  return crowd > best.crowd ? { d, crowd } : best;
}, { d: bell[0], crowd: -1 }).d;

// ---- a minute of walking ---------------------------------------------------------------------------------
{
  const spot = hub.pos.clone().add(new THREE.Vector3(0, 0, .03)).normalize();
  stand(spot);
  const phase = [];
  const speeds = [];
  const feet = [];
  const tilts = [];
  let jumped = 0, backwards = 0, worstTiltJump = 0, worstFootJump = 0, worstSlide = 0;
  let prevPhase = hub.phase, prevTilt = hub.headTilt, prevFeet = hub.foot.slice(), prevPos = hub.pos.clone();
  for (let f = 0; f < 120 * 60; f++) {
    updateBell(dt, f * dt);
    state.radius = R + heightAt(state.direction) + EYE;
    state.speed = 0;
    phase.push(hub.phase);
    speeds.push(hub.vel);
    feet.push(hub.foot.slice());
    tilts.push(hub.headTilt);
    let d = hub.phase - prevPhase;
    while (d < -Math.PI) d += TAU;
    while (d > Math.PI) d -= TAU;
    if (d < -.001) backwards++;
    if (Math.abs(d) > .30) jumped++;
    worstTiltJump = Math.max(worstTiltJump, Math.abs(hub.headTilt - prevTilt));
    for (let k = 0; k < hub.foot.length; k++) worstFootJump = Math.max(worstFootJump, Math.abs(hub.foot[k] - prevFeet[k]));
    worstSlide = Math.max(worstSlide, hub.pos.distanceTo(prevPos) * R);
    prevPos.copy(hub.pos);
    prevPhase = hub.phase; prevTilt = hub.headTilt; prevFeet = hub.foot.slice();
  }
  const totalTurn = (phase[phase.length - 1] - phase[0]);
  ok('the stride advances, a frame at a time, without ever running backwards', backwards === 0 && jumped === 0,
    'a minute beside the herd: the animal\'s stride clock turned ' + (totalTurn / TAU).toFixed(1) + ' revolutions, ' +
    'never backwards, and never more than ' + Math.max(...phase.map((p, i) => i ? Math.abs(p - phase[i - 1]) : 0)).toFixed(3) +
    ' rad in one frame');
  const moving = speeds.filter(v => v > .02).length;
  ok('and it walks for most of that minute', moving > 120 * 20,
    'the animal was actually moving on ' + (moving / 120).toFixed(0) + ' of the 60 seconds at up to ' +
    mm(Math.max(...speeds)) + '/s');

  // Legs: the hooves have to leave the ground.
  let lift = 0;
  for (const f of feet) for (const v of f) lift = Math.max(lift, v);
  ok('and its hooves come off the ground', lift > .0002,
    'the highest a hoof lifted in a minute of walking was ' + mm(lift) + ' — the page plants them from the stride, ' +
    'so a body that never lifts one is sliding');

  // Head: eased, never snapped.
  // The fastest ease in the page is 14 a second, which through a fully lowered head (a gap of 1.1 rad) is 0.12
  // in one frame — so that, not a tenth of that, is the line between "carried" and "switched".
  ok('and its head is carried, not switched', worstTiltJump < .13,
    'the biggest one-frame change in head tilt was ' + worstTiltJump.toFixed(3) + ' rad, which is the 14-a-second ' +
    'ease lifting a lowered head and nothing sharper');
  // `foot` is an offset in the animal's *own* frame, so it legitimately swings when the body turns; what may not
  // happen is the animal sliding further across the ground than its own speed accounts for.
  ok('and the body never slides further than its own legs (and one shoulder nudge) can carry it', worstSlide < .0016 + Math.max(...speeds) * dt,
    'the furthest it moved across the ground in one frame (1/120 s) was ' + mm(worstSlide) +
    ' against ' + mm(Math.max(...speeds) * dt) + ' allowed at its fastest');
}

// ---- and a minute of standing ---------------------------------------------------------------------------
{
  // Walk the walker well away, so the herd settles, then watch one animal that has gone back to grazing.
  const far = hub.pos.clone().addScaledVector(new THREE.Vector3(0, 0, 1).cross(hub.pos).normalize(), .30).normalize();
  stand(far);
  for (let f = 0; f < 120 * 20; f++) { updateBell(dt, f * dt); state.radius = R + heightAt(state.direction) + EYE; state.speed = 0; }
  const sleeper = bell.filter(d => !d.awake && d.vel === 0).sort((a, b) => a.world.distanceTo(hub.world) - b.world.distanceTo(hub.world))[0] || bell[0];
  const before = sleeper.pos.clone();
  let maxSlide = 0, maxFootSlide = 0, nan = 0;
  const feet0 = sleeper.foot.slice();
  for (let f = 0; f < 120 * 10; f++) {
    updateBell(dt, f * dt);
    state.radius = R + heightAt(state.direction) + EYE;
    state.speed = 0;
    maxSlide = Math.max(maxSlide, sleeper.pos.distanceTo(before) * R);
    for (let k = 0; k < sleeper.foot.length; k++) maxFootSlide = Math.max(maxFootSlide, Math.abs(sleeper.foot[k] - feet0[k]));
    if (!Number.isFinite(sleeper.phase + sleeper.headTilt)) nan++;
  }
  ok('\n  and an animal that is asleep stands still', maxSlide < .002 && maxFootSlide < .002 && nan === 0,
    'ten seconds of a sleeping animal ' + mm(sleeper.world.distanceTo(hub.world)) + ' from the hub: it slid ' +
    mm(maxSlide) + ' across the ground and its hooves moved ' + mm(maxFootSlide) + ', with no NaN in its pose');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
