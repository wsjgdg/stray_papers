// Walking, over ground that is not flat. The eye is 100 mm up and the ground under it is a height field that
// was never designed for walking: it has 1455 mm peaks, 476 mm trenches, and slopes of every angle in between.
//
// So this suite does the unglamorous thing — it puts a body on four kinds of ground (flat, gentle, steep, and
// a wall of a hill) and walks it, and measures the things a person would notice: that the eye is a constant
// height above the ground, that the body never sinks into a slope, that the speed does not stutter, and that
// nothing teleports.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, CROUCH_EYE, WALK_SPEED, SPRINT_SPEED, WALKER_RADIUS, heightAt, state, keys, joystick,
  physicsStep, resetGroundMotion, walkBoxes, hardProps } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';

const dt = 1 / 120;
// The gradient of the ground at a direction, in world units per unit of ground distance: how steep it is.
function slopeAt(dir) {
  const ex = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
  const ez = new THREE.Vector3().crossVectors(dir, ex).normalize();
  const e = .002;
  const hx = heightAt(dir.clone().addScaledVector(ex, e)) - heightAt(dir.clone().addScaledVector(ex, -e));
  const hz = heightAt(dir.clone().addScaledVector(ez, e)) - heightAt(dir.clone().addScaledVector(ez, -e));
  return Math.hypot(hx, hz) / (2 * e);
}
// A spot on dry land with a slope near `want`, looking for it at random so the four kinds of ground are real
// terrain and not a synthetic ramp.
const clear = (dir, reach = .09) => {
  for (const p of hardProps) if (p.dir.dot(dir) > .995 && p.dir.distanceTo(dir) - p.r < reach) return false;
  for (const box of walkBoxes) {
    if (box.dir.dot(dir) < .995) continue;
    const off = box.dir.clone().sub(dir).multiplyScalar(R);
    if (Math.abs(off.dot(box.ex)) < box.hx + reach && Math.abs(off.dot(box.ez)) < box.hz + reach) return false;
  }
  return heightAt(dir) > SEA + .01;
};
// A spot on dry land, of the slope asked for, with nothing solid near enough to bump into on the way.
const find = (want, tolerance = .2, tries = 60000) => {
  for (let i = 0; i < tries; i++) {
    const y = 1 - (i * 2 + 1) / tries, a = i * Math.PI * (3 - Math.sqrt(5)), r = Math.sqrt(1 - y * y);
    const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (heightAt(d) < SEA + .02) continue;
    const s = slopeAt(d);
    if (Math.abs(s - want) > tolerance) continue;
    if (!clear(d)) continue;
    return { dir: d, slope: s };
  }
  return null;
};
const stand = (dir, heading = null) => {
  resetGroundMotion(); keys.clear(); joystick.x = joystick.y = 0;
  state.mode = 'ground'; state.transition = null; state.ghost = false;
  state.direction.copy(dir);
  state.radius = R + Math.max(heightAt(dir), SEA) + EYE;
  state.heading.copy(heading || new THREE.Vector3(0, 0, 1).cross(dir).normalize());
  state.heading.addScaledVector(dir, -state.heading.dot(dir)).normalize();
  state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
  state.velocity = 0; state.grounded = true; state.moveVelocity.set(0, 0, 0);
  state.feetRadius = R + heightAt(dir);
  return state;
};
// One walk: hold W for a second and a bit, and record what the eye can catch. Short on purpose — this planet
// is small enough that eight seconds at a walk crosses a third of a province.
const SECONDS = 1.2;
function walk(spot, opts = {}) {
  const frames = Math.round(SECONDS / dt);
  stand(spot.dir, opts.heading);
  if (opts.sprint) keys.add('ShiftLeft');
  keys.add('KeyW');
  const rec = { eye: [], speed: [], jump: [], sink: 0, float: 0, travelled: 0, nan: 0, groundedFrames: 0 };
  let last = state.direction.clone();
  for (let f = 0; f < frames; f++) {
    physicsStep(dt);
    const ground = R + heightAt(state.direction);
    const eye = state.radius - ground;
    rec.eye.push(eye);
    rec.speed.push(state.speed);
    // The page's own promise: a grounded body is *at* the floor. That is exact to the millimetre, and it is
    // the invariant that a slope, a step or a shove would break.
    if (state.grounded) { rec.groundedFrames++; rec.sink = Math.min(rec.sink, eye - EYE); rec.float = Math.max(rec.float, eye - EYE); }
    const d = last.angleTo(state.direction) * R;
    rec.travelled += d;
    rec.jump.push(d);
    if (!Number.isFinite(state.radius)) rec.nan++;
    last.copy(state.direction);
  }
  keys.clear();
  rec.minEye = Math.min(...rec.eye);
  rec.maxEye = Math.max(...rec.eye);
  rec.stutter = 0;
  for (let i = 1; i < rec.speed.length; i++) rec.stutter = Math.max(rec.stutter, Math.abs(rec.speed[i] - rec.speed[i - 1]));
  rec.maxJump = Math.max(...rec.jump);
  // The first fifth is the ramp off a standstill; the walk's speed is the steady part.
  const steady = rec.speed.slice(Math.floor(rec.speed.length * .2));
  rec.meanSpeed = steady.reduce((a, b) => a + b, 0) / steady.length;
  return rec;
}

const flat = find(.05, .10), gentle = find(.45, .20), steep = find(1.10, .35);
if (!flat || !gentle || !steep) {
  console.log('  FAIL the world has no flat, gentle and steep ground clear enough to walk on');
  process.exit(1);
}

// ---- the eye is a constant height above the ground -------------------------------------------------------
{
  const a = walk(flat);
  ok('on flat ground a grounded body is exactly 100 mm up, to the millimetre',
    Math.abs(a.sink) < .0005 && Math.abs(a.float) < .0005,
    'on ' + a.groundedFrames + ' grounded frames the eye was ' + mm(a.sink) + ' to ' + mm(a.float) +
    ' off its nominal height; over the whole walk it measured ' + mm(a.minEye) + ' to ' + mm(a.maxEye) +
    ' (a body that steps off a ledge floats for a few frames, which is the only reason that range is not flat)');
}
{
  const b = walk(gentle);
  ok('and on a slope it is the same height, not a different one',
    Math.abs(b.sink) < .0005 && Math.abs(b.float) < .0005 && b.maxEye < EYE + .060,
    'slope ' + gentle.slope.toFixed(2) + ' at the start: ' + b.groundedFrames + ' grounded frames, ' +
    mm(b.sink) + ' to ' + mm(b.float) + ' off nominal; the highest the eye ever floated was ' + mm(b.maxEye) +
    ' (stepping off a rise)');
}
{
  const c = walk(steep);
  // Walking down a slope the body is briefly airborne and lands again — that is a walker, not a bug. What would
  // be a bug is the eye going *under* the ground it is standing on, so that is the assertion.
  ok('on a steep slope the eye never goes under the ground', Math.abs(c.sink) < .0005,
    'slope ' + steep.slope.toFixed(2) + ': the eye went at most ' + mm(Math.max(0, -c.sink)) +
    ' below its own height over the ground, and rose at most ' + mm(c.float) + ' over it on ' +
    c.groundedFrames + ' grounded frames');
}

// ---- the speed -------------------------------------------------------------------------------------------
{
  const a = walk(flat);
  ok('and the walk is the speed the page says it is', Math.abs(a.meanSpeed - WALK_SPEED) < WALK_SPEED * .06,
    'mean ' + mm(a.meanSpeed) + '/s against a nominal WALK_SPEED of ' + mm(WALK_SPEED) + '/s; it covered ' +
    mm(a.travelled) + ' in ' + SECONDS + ' s');
}
{
  const c = walk(steep);
  ok('and it does not stutter crossing a slope', c.stutter < .025,
    'the worst frame-to-frame change in speed on steep ground was ' + mm(c.stutter) + '/s (slope ' +
    steep.slope.toFixed(2) + ')');
}
{
  // Nothing teleports: no single frame may move the body further than a sprint frame plus a millimetre. This is
  // the number that would catch an escape shove, a respawn, or a bad normalisation.
  const a = walk(steep);
  const limit = SPRINT_SPEED * dt + .0015;
  ok('and no frame ever teleports the body', a.maxJump < limit,
    'the furthest a single frame moved it: ' + mm(a.maxJump) + ' against a sprint frame of ' + mm(SPRINT_SPEED * dt));
}

// ---- crouching -------------------------------------------------------------------------------------------
{
  stand(flat.dir);
  keys.add('KeyC');
  let lowest = Infinity;
  for (let f = 0; f < 120; f++) {
    physicsStep(dt);
    lowest = Math.min(lowest, state.radius - R - heightAt(state.direction));
  }
  keys.delete('KeyC');
  for (let f = 0; f < 120; f++) physicsStep(dt);
  const stood = state.radius - R - heightAt(state.direction);
  ok('crouching drops the eye to 50 mm and standing up brings it back', lowest < CROUCH_EYE + .004 && Math.abs(stood - EYE) < .004,
    'lowest while crouched ' + mm(lowest) + ' (nominal ' + mm(CROUCH_EYE) + '), and ' + mm(stood) +
    ' after standing again');
}

// ---- and a hill you cannot walk up ---------------------------------------------------------------
{
  // The steepest dry ground on the planet, and a body walking straight at it: whatever happens, it may not end
  // up inside the hill, and it may not be thrown anywhere.
  let worst = null;
  for (let i = 0; i < 6000; i++) {
    const y = 1 - (i * 2 + 1) / 6000, a = i * Math.PI * (3 - Math.sqrt(5)), r = Math.sqrt(1 - y * y);
    const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (heightAt(d) < SEA + .03) continue;
    const s = slopeAt(d);
    if (!worst || s > worst.slope) worst = { dir: d, slope: s };
  }
  // Walk at the uphill direction, not along the contour: the gradient, as a heading.
  const ex = new THREE.Vector3(1, 0, 0).cross(worst.dir).normalize();
  const ez = new THREE.Vector3().crossVectors(worst.dir, ex).normalize();
  const e = .002;
  const dhx = heightAt(worst.dir.clone().addScaledVector(ex, e)) - heightAt(worst.dir.clone().addScaledVector(ex, -e));
  const dhz = heightAt(worst.dir.clone().addScaledVector(ez, e)) - heightAt(worst.dir.clone().addScaledVector(ez, -e));
  const uphill = ex.clone().multiplyScalar(dhx).addScaledVector(ez, dhz).normalize();
  const run = walk(worst, { heading: uphill });
  // A height-field walker has no step limit: against a wall of ground it is lifted rather than stopped, which
  // is a choice the page made long before this suite. What is measured is that it is a *lift* — the eye comes
  // out on top of the ground, and the body is never left inside the hill.
  ok('and a wall of ground lifts the body instead of swallowing it', run.nan === 0 && run.sink > -.040,
    'steepest dry ground ' + worst.slope.toFixed(2) + ' (' + (Math.atan(worst.slope) * 180 / Math.PI).toFixed(0) +
    '°) walked straight at: the body covered ' + mm(run.travelled) + ', was grounded on ' + run.groundedFrames +
    ' frames, and the eye was never more than ' + mm(Math.max(0, -run.sink)) + ' under the ground it stood on');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
