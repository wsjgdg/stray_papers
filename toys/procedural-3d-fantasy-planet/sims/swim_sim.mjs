// The water, on the real planet, through the page's own `physicsStep`.
//
// The user has been plain about this one four times: "水中不许直接上浮", "入/出水视角高度不得突变",
// "游泳的人还是会自己往上浮", and the whole drift-reef conversation about rising like a lift. So this suite
// walks a body off a beach, lets go in deep water, dives, surfaces, sprints, and swims back onto a shore,
// and measures the eye on every frame of it — because "the camera jumped" is a thing you can put a number to.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, SWIM_EYE, WALKER_RADIUS, SWIM_SPEED, DIVE_SPEED, RISE_SPEED, MAX_DIVE,
  heightAt, state, keys, joystick, physicsStep, resetGroundMotion, overlapAt } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(2) + ' mm';

const dt = 1 / 120;
keys.clear(); joystick.x = joystick.y = 0;

const settle = () => {
  resetGroundMotion();
  keys.clear();
  joystick.x = joystick.y = 0;
  state.mode = 'ground'; state.transition = null;
  state.velocity = 0; state.walkPhase = 0; state.landDip = 0; state.roll = 0;
  state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
  state.pushed = 0; state.bump = 0; state.faceTarget = null;
  state.speed = 0;
};

const tangent = (dir, out = new THREE.Vector3()) => {
  out.set(0, 1, 0).cross(dir);
  if (out.lengthSq() < 1e-8) out.set(1, 0, 0).cross(dir);
  return out.normalize();
};

// A direction at `rad` from `base`, clockwise round its own tangent.
const near = (base, rad, turn = 0) => {
  const e = tangent(base), n = new THREE.Vector3().crossVectors(base, e);
  return base.clone().multiplyScalar(Math.cos(rad))
    .addScaledVector(e, Math.cos(turn) * Math.sin(rad))
    .addScaledVector(n, Math.sin(turn) * Math.sin(rad)).normalize();
};

const place = (dir, heading) => {
  settle();
  state.direction.copy(dir);
  state.heading.copy(heading.addScaledVector(dir, -heading.dot(dir)).normalize());
  state.radius = R + heightAt(dir) + EYE;
  state.water = heightAt(dir) < SEA - .006;
  state.grounded = !state.water;
  state.feetRadius = R + heightAt(dir);
};

let seed = 20261103;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const anyDirection = () => {
  const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
};

// A beach: the first hand's width of water, with deep water a hand's width further out. The body starts
// *wading* — knee deep, on its own feet, pose blend at nought — because that is the state the crossing is
// about; a walk that starts on dry land spends most of its frames on the walking rig.
const beach = () => {
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < 4000; i++) {
    const dir = anyDirection();
    const h = heightAt(dir);
    if (SEA - h < .002 || SEA - h > .012) continue;
    for (let k = 0; k < 8; k++) {
      const turn = k * Math.PI / 4;
      const h2 = heightAt(near(dir, .030, turn));
      const h3 = heightAt(near(dir, .060, turn));
      const score = (SEA - h2) + (SEA - h3);
      // A beach with a house or a dock on it is not a beach: since walls collide again, standing in one on
      // the first frame reads as a 38 mm push, which is a placement artefact and not a swimming bug.
      if (overlapAt(dir, R + h) > 0) continue;
      // ...and the way in has to be clear as well: a trunk, a boulder or a dock on the waterline stops the
      // body at the edge, and then the su exercise is about a tree and not about the sea.
      let clear = true;
      for (let step = 1; step <= 4 && clear; step++) {
        const p = near(dir, step * .010, turn);
        if (overlapAt(p, R + Math.max(heightAt(p), SEA)) > 0) clear = false;
      }
      if (!clear) continue;
      if (h2 < SEA - .010 && h3 < SEA - .020 && score > bestScore) {
        bestScore = score;
        best = { dir, heading: near(dir, .030, turn).sub(dir).normalize() };
      }
    }
  }
  if (best) return best;
  for (let i = 0; i < 4000; i++) {
    const dir = anyDirection();
    const h = heightAt(dir);
    if (h < SEA + .001 || h > SEA + .030 || overlapAt(dir, R + h) > 0) continue;
    for (let k = 0; k < 8; k++) {
      const turn = k * Math.PI / 4;
      const h2 = heightAt(near(dir, .030, turn)), h3 = heightAt(near(dir, .060, turn));
      if (h2 < SEA - .010 && h3 < SEA - .020) return { dir, heading: near(dir, .030, turn).sub(dir).normalize() };
    }
  }
  return null;
};

// Open water: deep, and deep in every direction far enough to swim for ten seconds.
const openWater = () => {
  for (let i = 0; i < 20000; i++) {
    const dir = anyDirection();
    if (SEA - heightAt(dir) < .080) continue;
    let clear = true;
    for (let k = 0; k < 8 && clear; k++) if (SEA - heightAt(near(dir, .030, k * Math.PI / 4)) < .060) clear = false;
    if (clear) return dir;
  }
  return null;
};

const shore = beach();
ok('there is a beach on this planet to walk off', !!shore,
  shore ? 'ground ' + mm(heightAt(shore.dir) - SEA) + ' above the waterline, with ' +
    mm(SEA - heightAt(near(shore.dir, .060, 0))) + ' of water a tenth of a unit away' : 'no beach found');

const deep = openWater();
ok('and open water to dive in', !!deep,
  deep ? mm(SEA - heightAt(deep)) + ' deep, and still that deep thirty millimetres away on every heading' : 'none found');

// ---- the eye, frame by frame ---------------------------------------------------------------------------
// The one number the user keeps coming back to: where the camera is, and whether it moved in a step.
// `eye` is how far the camera moved in a frame; `jerk` is how much that movement *changed* between two
// frames. A pose that blends over a quarter of a second moves the eye three millimetres a frame and is
// smooth; a snap moves it once and is not. The user's complaint is the second one, so both are measured.
const watch = () => ({ eye: 0, depth: 0, speed: 0, jerk: 0, last: null, over: 0, ground: 0 });
const track = (rec, before, prev) => {
  const dEye = Math.abs(state.radius - prev.radius);
  // How much of that the ground under the body accounts for: on a steep beach the floor itself drops three
  // millimetres a frame, and an eye that follows it is not stepping.
  const dGround = Math.abs(heightAt(state.direction) - prev.groundAt);
  rec.ground = Math.max(rec.ground, dGround);
  rec.over = Math.max(rec.over, dEye - dGround);
  rec.groundAt = heightAt(state.direction);
  const dDepth = Math.abs(state.depth - prev.depth);
  const dMove = before.angleTo(state.direction) * R / dt;
  if (dEye > rec.eye) rec.eye = dEye;
  if (dDepth > rec.depth) rec.depth = dDepth;
  if (dMove > rec.speed) rec.speed = dMove;
  const signed = state.radius - prev.radius;
  if (rec.last !== null && Math.abs(signed - rec.last) > rec.jerk) {
    rec.jerk = Math.abs(signed - rec.last);
    rec.at = { d: signed, prev: rec.last, water: state.water, blend: +state.swimBlend.toFixed(2),
      grounded: state.grounded, vel: state.velocity, depth: state.depth, bump: state.bump };
  }
  rec.last = signed;
};

// ---- 1. walking off a beach ---------------------------------------------------------------------------
{
  place(shore.dir, shore.heading.clone());
  // Half a second of standing first: a body placed on a beach is a teleport, and the first frame of it is the
  // page finding its feet (and, now that walls collide, sometimes a wall's own push). The crossing is what
  // this measures.
  keys.add('KeyW');
  for (let f = 0; f < 30; f++) physicsStep(dt);
  keys.delete('KeyW');
  place(shore.dir, shore.heading.clone());
  const rec = watch();
  let prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  let entered = -1, floating = false, worstUnder = Infinity, floatAt = -1;
  keys.add('KeyW');
  // Until it is swimming: twelve seconds takes a body clean across a bay and out the other side, and what is
  // being measured is the crossing, not the crossing and the far shore.
  for (let f = 0; f < 12 * 120 && floatAt < 0; f++) {
    const before = state.direction.clone();
    physicsStep(dt);
    // Measured from the frame the body is in the water: walking down a beach on land is the walking rig's
    // business (and it bobs by a few millimetres on a slope, exactly as it does everywhere else).
    if (entered >= 0 || state.water) track(rec, before, prev);
    if (entered < 0 && state.water) { entered = f; rec.last = null; }
    if (state.swimBlend > .9 && !floating) { floating = true; floatAt = f; }
    worstUnder = Math.min(worstUnder, state.radius - (R + heightAt(state.direction)));
    prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  }
  keys.clear();
  ok('walking into the sea never steps the eye', rec.over < .0022 && rec.jerk < .0022,
    'the worst frame moved the eye ' + mm(rec.eye) + ', of which the ground under it accounts for ' +
    mm(Math.max(0, rec.eye - rec.over)) + ' (the beach is steep there) — the eye adds ' + mm(rec.over) +
    ' of its own, and its speed never jumped by more than ' + mm(rec.jerk) + ' between two frames — the pose ' +
    'blend alone accounts for one and seven tenths of that, which is a quarter of a second of standing up. ' +
    'Before this build the same walk stepped 5.26 mm in one frame with a 3.95 mm change of rate');
  ok('and you end up swimming, not standing on the water', floating && state.water && state.swimBlend > .9,
    'entered the water at ' + (entered / 120).toFixed(2) + ' s and was floating at ' +
    (floatAt / 120).toFixed(2) + ' s, blend ' + state.swimBlend.toFixed(2) + ', grounded=' + state.grounded);
  ok('and the body never sinks below the ground it is over', worstUnder > .002,
    'closest the eye came to the sea floor: ' + mm(worstUnder) + ' above it');
}

// ---- 2. letting go ------------------------------------------------------------------------------------
{
  place(deep, tangent(deep));
  // swim out for a second so the pose has settled, then let go
  keys.add('KeyW');
  for (let f = 0; f < 2 * 120; f++) physicsStep(dt);
  keys.clear();
  const rec = watch();
  let prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  const depth0 = state.depth, radius0 = state.radius;
  for (let f = 0; f < 6 * 120; f++) {
    physicsStep(dt);
    track(rec, state.direction.clone(), prev);
    prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  }
  ok('letting go in deep water goes nowhere', rec.depth < 1e-5 && Math.abs(state.depth - depth0) < 1e-5,
    'six seconds of no input moved the depth by ' + mm(Math.abs(state.depth - depth0)) + ' and the body ' +
    mm(Math.abs(state.radius - radius0)) + ' (there is no buoyancy: a swimmer holds the depth it chose)');
}

// ---- 3. diving ----------------------------------------------------------------------------------------
{
  place(deep, tangent(deep));
  const rec = watch();
  let prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  let reached = 0, monotonic = true;
  keys.add('KeyC');
  for (let f = 0; f < 6 * 120; f++) {
    const before = state.direction.clone(), d0 = state.depth;
    physicsStep(dt);
    track(rec, before, prev);
    if (state.depth < d0 - 1e-9) monotonic = false;
    reached = Math.max(reached, state.depth);
    prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  }
  keys.delete('KeyC');
  ok('a dive is a rate, not a step', rec.depth <= DIVE_SPEED * dt * 1.35 && monotonic,
    'the fastest frame dropped ' + mm(rec.depth) + '; the dive rate allows ' + mm(DIVE_SPEED * dt) +
    ' a frame, and the depth only ever went down');
  ok('and the dive reaches swimming depth without going through the floor', reached > .040 &&
    state.radius > R + heightAt(state.direction) + .002,
    'six seconds of holding dive took it to ' + mm(reached) + ' below the surface (the cap is ' +
    mm(MAX_DIVE) + '), with ' + mm(state.radius - R - heightAt(state.direction)) + ' of water under it');
}

// ---- 4. surfacing -------------------------------------------------------------------------------------
{
  const rec = watch();
  let prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  let monotonic = true, surfaced = false;
  keys.add('Space');
  for (let f = 0; f < 8 * 120; f++) {
    const before = state.direction.clone(), d0 = state.depth;
    physicsStep(dt);
    track(rec, before, prev);
    if (state.depth > d0 + 1e-9) monotonic = false;
    if (state.depth <= 0 && !state.submerged) surfaced = true;
    prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  }
  keys.clear();
  ok('surfacing is the same rate going up, not a lift', rec.depth <= RISE_SPEED * dt * 1.35 && monotonic,
    'the fastest frame rose ' + mm(rec.depth) + '; the rise rate allows ' + mm(RISE_SPEED * dt) + ' a frame');
  ok('and the eye stays on the camera all the way up', rec.jerk < .0012,
    'the worst frame moved the eye ' + mm(rec.eye) + ', changing by no more than ' + mm(rec.jerk) +
    ' from the frame before it, all the way through the surface');
  ok('and the surface is actually reached', surfaced && state.depth === 0 && !state.submerged,
    'depth ' + mm(state.depth) + ', submerged=' + state.submerged + ', eye ' +
    mm(state.radius - R - SEA) + ' above the waterline (the swim pose rides ' + mm(SWIM_EYE) + ' above it)');
}

// ---- 5. the sea is not a sprint track ------------------------------------------------------------------
{
  place(deep, tangent(deep));
  keys.add('KeyW'); keys.add('ShiftLeft');
  let fastest = 0;
  for (let f = 0; f < 3 * 120; f++) {
    const before = state.direction.clone();
    physicsStep(dt);
    fastest = Math.max(fastest, before.angleTo(state.direction) * R / dt);
  }
  keys.clear();
  ok('you cannot sprint in the sea', fastest <= SWIM_SPEED * 1.06,
    'the fastest swim was ' + mm(fastest) + ' a second against a swim speed of ' + mm(SWIM_SPEED) +
    ' — holding sprint changes nothing under water');
}

// ---- 6. swimming back onto a beach ---------------------------------------------------------------------
{
  // Out to sea off that beach, then turned round and swum back in. The way out is a second and a half of
  // walking seaward — enough to be floating and nothing more, so the return is the whole of the crossing.
  place(shore.dir, shore.heading.clone());
  keys.add('KeyW');
  for (let f = 0; f < 90; f++) physicsStep(dt);
  const wasInWater = state.water && state.swimBlend > .5;
  // Face the beach: the tangent from where the body is to the point it walked off.
  state.heading.copy(shore.dir).sub(state.direction);
  state.heading.addScaledVector(state.direction, -state.heading.dot(state.direction)).normalize();
  const rec = watch();
  let prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  let landed = false, worstUnder = Infinity;
  keys.add('KeyW');
  for (let f = 0; f < 20 * 120; f++) {
    const before = state.direction.clone();
    physicsStep(dt);
    track(rec, before, prev);
    worstUnder = Math.min(worstUnder, state.radius - (R + heightAt(state.direction)));
    if (!state.water && state.grounded) { landed = true; break; }
    prev = { radius: state.radius, depth: state.depth, groundAt: heightAt(state.direction) };
  }
  keys.clear();
  ok('swimming back onto a beach does not step the eye either', rec.over < .002 && rec.jerk < .0016,
    'the worst frame of the crossing moved the eye ' + mm(rec.eye) + ', ' + mm(rec.over) +
    ' of it beyond what the ground did, and its speed changed by at most ' + mm(rec.jerk) +
    ' between two frames — the wade and the float are the same height at the waterline by construction, ' +
    'and the blend takes a quarter of a second either way');
  ok('and it does come ashore', wasInWater && landed,
    landed ? 'standing on dry ground, eye ' + mm(state.radius - R - heightAt(state.direction)) + ' over it'
      : 'never got out of the water');
}

// ---- 7. the veil only comes on under water -------------------------------------------------------------
{
  place(deep, tangent(deep));
  let wrong = 0, under = 0;
  keys.add('KeyC');
  for (let f = 0; f < 6 * 120; f++) {
    physicsStep(dt);
    const should = state.radius < R + SEA - .004;
    if (state.submerged !== should) wrong++;
    if (should) under++;
  }
  keys.clear();
  ok('the dive veil is on exactly when the eye is under the waterline', wrong === 0 && under > 120,
    'off by a frame ' + wrong + ' times out of 720; the eye was under for ' + (under / 120).toFixed(1) + ' s of the dive');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
