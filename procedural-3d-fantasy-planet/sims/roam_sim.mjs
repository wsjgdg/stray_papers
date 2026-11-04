// The walker on the real planet. `-59`/`-60` fixed two collision bugs that only existed on the machine:
// a body that ended a frame inside a wall, and a body shoved sideways by a plinth it had just climbed.
// The check that found them was a random walk over the whole world, so this is that check, rebuilt on the
// world bench: twenty-four walks, twenty seconds each, through real towns, real trunks and real boulders,
// and the body is never inside anything at the end of a step.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, WALKER_RADIUS, SPRINT_SPEED, heightAt, state, keys, joystick, physicsStep, walkBoxes, hardProps, stoneSolids, bell, reefs, overlapAt, resetGroundMotion } = world;

// Every walk starts from the page's own idea of a settled body. The bench used to leave the motion state
// over from the previous walk, and a jump buffer or a coyote-time left behind made the next body leap as
// soon as it was placed — four hundred millimetres of air it never asked for, and a landing inside a boulder.
const settle = () => {
  resetGroundMotion();
  state.velocity = 0; state.walkPhase = 0; state.landDip = 0; state.roll = 0;
  state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
  state.pushed = 0; state.bump = 0; state.faceTarget = null;
};

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); } else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); } };

keys.clear(); joystick.x = joystick.y = 0;

// A deterministic pseudo-random walk over the planet's directions.
let seed = 20261103;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const landDir = () => {
  for (let i = 0; i < 400; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
    if (heightAt(dir) > SEA + .02) return dir;
  }
  return new THREE.Vector3(0, 0, 1);
};

const tangentTo = (dir, out = new THREE.Vector3()) => {
  out.set(0, 1, 0).cross(dir);
  if (out.lengthSq() < 1e-8) out.set(1, 0, 0).cross(dir);
  return out.normalize();
};

// How deep inside anything the body is, in metres. Negative means inside. Measured as a chord, because that
// is the metric the page resolves collisions in: a body pushed out of a boulder sits exactly `r + radius`
// of chord from it, and a test that used the angle instead would call that half a millimetre inside. Static solids and the creatures
// are measured separately: a wall must never be entered, while a creature is a post that moves and is
// allowed to push you — that is the design, and `state.pushed` is what reports it.
const clearance = (withCreatures = true) => {
  const dir = state.direction;
  // The page's own reading of where the body's feet are, not a second opinion: in water the feet ride the
  // swimmer's height, not the sea floor, and a harness that computes it itself measures against solids the
  // page has already decided are under the swimmer's feet.
  const feet = state.feetRadius !== undefined ? state.feetRadius : R + heightAt(dir);
  let worst = Infinity;
  for (const post of hardProps) {
    if (post.top !== undefined && post.top <= feet) continue;
    if (post.dir.dot(dir) < .9) continue;
    worst = Math.min(worst, post.dir.distanceTo(dir) * R - post.r - WALKER_RADIUS);
  }
  for (const stone of stoneSolids) {
    if (stone.top !== undefined && stone.top <= feet) continue;
    if (stone.dir.dot(dir) < .9) continue;
    worst = Math.min(worst, stone.dir.distanceTo(dir) * R - stone.r - WALKER_RADIUS);
  }
  for (const box of walkBoxes) {
    // A wall has a bottom: a town standing on a ledge does not block the beach below it.
    if (box.top <= feet || box.bottom > feet + .020 || box.dir.dot(dir) < .9) continue;
    const off = box.dir.clone().sub(dir).multiplyScalar(R);
    const u = off.dot(box.ex), v = off.dot(box.ez);
    const gap = Math.max(Math.abs(u) - box.hx, Math.abs(v) - box.hz) - WALKER_RADIUS;
    worst = Math.min(worst, gap);
  }
  if (withCreatures) for (const bodies of [bell, reefs]) {
    for (const body of bodies) {
      const hit = body.hit;
      if (!hit || hit.top <= feet || hit.bottom > feet + .085) continue;
      if (body.pos.dot(dir) < .95) continue;
      worst = Math.min(worst, body.pos.distanceTo(dir) * R - hit.r - WALKER_RADIUS);
    }
  }
  return worst;
};

// Where the page would put you: a hole in the world is not a walking bug, so the walk starts on clear
// ground — and how often a random land point is not clear is worth knowing too.
const spawn = () => {
  for (let i = 0; i < 400; i++) {
    const dir = landDir();
    state.mode = 'ground'; state.transition = false;
    state.direction.copy(dir);
    state.radius = R + heightAt(dir) + EYE;
    state.heading = tangentTo(dir);
    state.grounded = true; state.velocity = 0; state.moveVelocity.set(0, 0, 0);
    state.water = false;
    settle();
    state.feetRadius = R + heightAt(dir);
    if (clearance() > 0) return dir;
  }
  return landDir();
};

const dt = 1 / 120;
let deepest = Infinity, deepestCreature = Infinity, worstAt = null, minTravelled = Infinity, framesInWater = 0, frames = 0, stuckRuns = 0, stalled = 0;
let maxStep = 0, maxStepAt = null;

for (let run = 0; run < 24; run++) {
  const start = spawn();
  state.mode = 'ground'; state.transition = false;
  state.direction.copy(start);
  state.radius = R + heightAt(start) + EYE;
  state.heading = tangentTo(start);
  state.grounded = true; state.velocity = 0;
  state.moveVelocity.set(0, 0, 0);
  state.water = false; state.depth = 0; state.swimBlend = 0; state.crouch = 0; state.slope = 1;
  const from = state.direction.clone();
  let travelled = 0, still = 0;
  keys.add('KeyW');
  for (let step = 0; step < 20 * 120; step++) {
    // turn a little every half second, like a person wandering
    if (step % 60 === 0) {
      const turn = (rnd() - .5) * 1.6;
      state.heading.applyAxisAngle(state.direction, turn);
      state.heading.addScaledVector(state.direction, -state.heading.dot(state.direction)).normalize();
    }
    const before = state.direction.clone();
    physicsStep(dt);
    const stepDistance = before.distanceTo(state.direction) * R;
    if (stepDistance > maxStep) { maxStep = stepDistance; maxStepAt = { run, step, water: state.water }; }
    travelled += before.angleTo(state.direction) * R;
    frames++;
    if (state.water) framesInWater++;
    const clear = clearance(false);
    if (clear < deepest) {
      deepest = clear; worstAt = { run, step, dir: state.direction.clone(), water: state.water };
      // which solid is it? (a town wall, a trunk, a boulder or a stone the ground pass laid)
      const feet = state.feetRadius !== undefined ? state.feetRadius : R + heightAt(state.direction);
      const tag = [];
      tag.push('overlapAt=' + (overlapAt(state.direction, feet) * 1000).toFixed(3) + 'mm');
      tag.push('water=' + state.water + ' mode=' + state.mode + ' depth=' + (state.depth * 1000).toFixed(1) + 'mm transition=' + state.transition);
      tag.push('feet=' + ((feet - R) * 1000).toFixed(2) + 'mm ground=' + (heightAt(state.direction) * 1000).toFixed(2) + 'mm');
      for (const post of hardProps) if (!(post.top !== undefined && post.top <= feet) && post.dir.dot(state.direction) >= .9 &&
        post.dir.distanceTo(state.direction) * R - post.r - WALKER_RADIUS < 0) tag.push('prop@' + (post.dir.distanceTo(state.direction) * R - post.r - WALKER_RADIUS).toFixed(4));
      for (const st of stoneSolids) if (!(st.top !== undefined && st.top <= feet) && st.dir.dot(state.direction) >= .9 &&
        st.dir.distanceTo(state.direction) * R - st.r - WALKER_RADIUS < 0) tag.push('stone@' + (st.dir.distanceTo(state.direction) * R - st.r - WALKER_RADIUS).toFixed(4));
      for (const box of walkBoxes) {
        if (box.top <= feet || box.bottom > feet + .020 || box.dir.dot(state.direction) < .9) continue;
        const off = box.dir.clone().sub(state.direction).multiplyScalar(R);
        const u = off.dot(box.ex), v = off.dot(box.ez);
        const gap = Math.max(Math.abs(u) - box.hx, Math.abs(v) - box.hz) - WALKER_RADIUS;
        if (gap < 0) tag.push('box@' + gap.toFixed(4) + ' hx=' + box.hx.toFixed(3) + ' hz=' + box.hz.toFixed(3));
      }
      worstAt.tag = tag.join(' ');
    }
    const creature = clearance(true);
    if (creature < deepestCreature) { deepestCreature = creature; }
    // Not "the direction did not change": a body squeezed between two boulders oscillates by a thousandth
    // of a millimetre a step and never goes anywhere. Movement is what is counted.
    if (before.angleTo(state.direction) * R < 5e-5) still++; else still = 0;
    // A body that has not moved for a quarter second is against something: a person stops and goes another
    // way, so the walk turns — a long way, because a narrow gap between two boulders is not something you get
    // out of by leaning on it — and again every quarter second, because the next way may be blocked too.
    if (still > 0 && still % 30 === 0) {
      state.heading.applyAxisAngle(state.direction, (rnd() < .5 ? -1 : 1) * (1.0 + rnd() * 1.2));
      state.heading.addScaledVector(state.direction, -state.heading.dot(state.direction)).normalize();
      stalled++;
    }
    if (still > 240) {
      stuckRuns++;
      if (stuckRuns <= 3) {
        let near = 0, nearKind = '';
        for (const bodies of [bell, reefs]) for (const body of bodies) {
          const hit = body.hit;
          if (!hit) continue;
          const gap = body.pos.distanceTo(state.direction) * R - hit.r - WALKER_RADIUS;
          if (gap < .05 && gap < near) { near = gap; nearKind = bodies === bell ? 'bell' : 'raft'; }
        }
        console.log('    (wedged at run ' + run + ', water=' + state.water + ', grounded=' + state.grounded +
          ', slope=' + state.slope.toFixed(2) + ', pushed=' + (state.pushed * 1000).toFixed(2) + ' mm' +
          ', clearance=' + (clearance() * 1000).toFixed(1) + ' mm, overlapAt=' + (overlapAt(state.direction, state.feetRadius) * 1e6).toFixed(2) + ' µm' +
          (nearKind ? ', ' + nearKind + ' at ' + (near * 1000).toFixed(1) + ' mm' : ', nothing living near') + ')');
      }
      break;
    }
  }
  keys.delete('KeyW');
  minTravelled = Math.min(minTravelled, travelled);
}

// Ordinary walks start clear, unlike the deliberate forced-embedding tests. They must stay clear of
// every static collider; allow only a micron of floating-point error, not the former 4 mm graze.
ok('the body never ends a step inside a wall, a trunk, a boulder or a stone', deepest >= -1e-6,
  'closest it came: ' + (deepest * 1000).toFixed(1) + ' mm of margin, over ' + frames + ' steps' +
  (worstAt ? ' (run ' + worstAt.run + ', step ' + worstAt.step + (worstAt.water ? ', in water' : '') + '; ' + worstAt.tag + ')' : ''));
ok('and the only thing that ever overlaps it is a living body doing the pushing', deepestCreature >= -.09,
  'the closest a bell or a raft came was ' + (deepestCreature * 1000).toFixed(1) + ' mm (contact with a creature is by design; a wall is not)');
const maxAllowedStep = SPRINT_SPEED * 1.18 * dt + .0016;
ok('and no frame is a sideways teleport on any of those walks', maxStep <= maxAllowedStep + 1e-6,
  'largest step ' + (maxStep * 1000).toFixed(2) + ' mm at 120 Hz, bound ' + (maxAllowedStep * 1000).toFixed(2) +
  ' mm' + (maxStepAt ? ' (run ' + maxStepAt.run + ', step ' + maxStepAt.step + (maxStepAt.water ? ', water' : '') + ')' : ' (no movement)'));
ok('and no walk is ever trapped', stuckRuns === 0,
  stuckRuns + ' walks spent two seconds without moving (' + stalled + ' times a wall stopped the walk and it went round another way)');
ok('every walk got somewhere', minTravelled > .20,
  'the shortest of the 24 walks covered ' + (minTravelled * 1000).toFixed(0) + ' mm in 20 s');
ok('and the walk went through water as well as over ground', framesInWater > frames * .05,
  (framesInWater / frames * 100).toFixed(0) + '% of the steps were in water');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
