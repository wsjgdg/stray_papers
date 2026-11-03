// The herd, on the real planet, through the page's own update functions. `-66` found a `ReferenceError` in
// `updateBell` that the walking test could not see — it never calls the animals — and that error would have
// been a blank screen in the browser. So this suite exists to run the parts of the frame the walk does not:
// sixty seconds of `updateBell` and `updateReefs`, and four promises the animals make.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, EYE, WALKER_RADIUS, heightAt, state, keys, joystick, physicsStep, updateBell, updateReefs,
  bell, reefs, hardProps, stoneSolids, walkBoxes, resetGroundMotion } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};

keys.clear(); joystick.x = joystick.y = 0;
const dt = 1 / 120;

// How far inside a solid an animal's body is, in metres of chord: the same measure the walker's collision
// uses, with the animal's own width instead of the walker's.
let clearanceReason = '';
const animalClearance = (pos, radius) => {
  const feet = R + heightAt(pos);
  let worst = Infinity;
  for (const [kind, list] of [['prop', hardProps], ['stone', stoneSolids]]) for (const [index, post] of list.entries()) {
    if (post.top !== undefined && post.top <= feet) continue;
    if (post.dir.dot(pos) < .95) continue;
    const gap = post.dir.distanceTo(pos) * R - post.r - radius;
    if (gap < worst) { worst = gap; clearanceReason = kind + ' ' + index; }
  }
  for (const box of walkBoxes) {
    if (box.top <= feet || (box.bottom !== undefined && box.bottom > feet + .020) || box.dir.dot(pos) < .9) continue;
    const off = box.dir.clone().sub(pos).multiplyScalar(R);
    const u = Math.abs(off.dot(box.ex)), v = Math.abs(off.dot(box.ez));
    // Only boxes the body is actually at: `.dot > .9` is a fifth of a radian, which on a planet of radius
    // 4.2 is three quarters of a unit — a town two streets away used to be measured as if it were on top of
    // the animal, and it only stopped mattering because the walls' bottoms were (wrongly) above every foot.
    if (u > box.hx + radius + .02 || v > box.hz + radius + .02) continue;
    // Negative is inside both expanded faces; outside either face is positive. The former minimum of
    // (extent - coordinate) had the opposite sign, so a body *inside* a wall was reported as clear.
    const gap = Math.max(u - box.hx, v - box.hz) - radius;
    if (gap < worst) { worst = gap; clearanceReason = 'wall ' + walkBoxes.indexOf(box); }
  }
  return worst;
};

// ---- sixty seconds of the animals' own frames -----------------------------------------------------------
// A herd sleeps until somebody is near it (that is the design: thirty animals grazing for nobody would be
// thirty animals costing a frame), so the walk has to stand with them for the minute to be about anything.
const stand = (target, offset) => {
  const side = new THREE.Vector3(1, 0, 0).cross(target);
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1).cross(target);
  side.normalize();
  const spot = target.clone().addScaledVector(side, offset / R).normalize();
  resetGroundMotion();
  keys.clear(); joystick.x = joystick.y = 0;
  state.mode = 'ground'; state.transition = null; state.direction.copy(spot);
  state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false;
  state.radius = R + heightAt(spot) + EYE; state.velocity = 0; state.grounded = true;
  return spot;
};
stand(bell[0].pos, .30);
const started = bell.map(d => d.pos.clone());
let worstDrop = 0, worstDropAt = null;
let moved = bell.map(() => 0), woke = bell.map(() => false), awakeFrames = bell.map(() => 0),
  travel = bell.map(() => 0), last = bell.map(d => d.pos.clone()), idle = bell.map(() => 0), idleMax = 0,
  lastVel = bell.map(d => d.vel || 0),
  bodyGap = Infinity, solidGap = Infinity, solidAt = '', broken = null;
try {
  for (let frame = 0; frame < 7200; frame++) {
    updateBell(dt, frame * dt);
    updateReefs(dt, frame * dt);
    for (let i = 0; i < bell.length; i++) {
      const d = bell[i];
      // how hard the speed was cut in one frame, relative to what it was
      const prevVel = lastVel[i], nowVel = d.vel || 0;
      // Falling asleep is a cut, but it happens thirty metres away, past the horizon; only frames where the
      // animal is awake are about what a player can see.
      // Below 2 mm/s the velocity is snapped to a clean zero so a resting animal does not creep; that is not a
      // stop anyone can see, so the measure starts above it.
      if (prevVel > .002 && d.awake) {
        const drop = (prevVel - nowVel) / prevVel;
        if (drop > worstDrop) { worstDrop = drop; worstDropAt = { i, f: frame, mode: d.mode, prevVel, nowVel, target: d.speed, awakeAfter: d.awake }; }
      }
      lastVel[i] = nowVel;
      if (!Number.isFinite(d.pos.x) || !Number.isFinite(d.pos.y) || !Number.isFinite(d.pos.z)) {
        broken = 'a bell position went to NaN on frame ' + frame; break;
      }
      moved[i] = Math.max(moved[i], started[i].angleTo(d.pos) * R);
      const step = last[i].angleTo(d.pos) * R;
      if (d.awake) {
        woke[i] = true;
        awakeFrames[i]++;
        travel[i] += step;                        // how far it actually walked, not how far it got
        // Standing still is what grazing *is*, and a bell in 'watch' or 'alert' is looking at you. The mode that
        // must move is 'walk': an animal that has decided to go somewhere and does not is a bug.
        if (d.mode === 'walk' && step < 5e-5) idle[i]++;
        else idle[i] = 0;
        idleMax = Math.max(idleMax, idle[i]);
      } else idle[i] = 0;
      last[i].copy(d.pos);
      const gap = animalClearance(d.pos, d.hit.r);
      if (gap < solidGap) { solidGap = gap; solidAt = 'bell ' + i + ', frame ' + frame + ', ' + clearanceReason; }
      for (let j = i + 1; j < bell.length; j++) {
        if (d.pos.dot(bell[j].pos) < .95) continue;
        bodyGap = Math.min(bodyGap, d.pos.distanceTo(bell[j].pos) * R - d.hit.r - bell[j].hit.r);
      }
    }
    if (broken) break;
  }
} catch (e) { broken = String(e && e.message || e); }
ok('sixty seconds of the page\'s own animal frames runs without throwing', !broken,
  broken || bell.length + ' bells and ' + reefs.length + ' rafts, ' + (7200 * dt).toFixed(0) + ' s');

// Only the herd you are standing with is awake; the other twenty-odd are asleep on purpose. So the question
// is not whether all thirty moved, it is whether every animal that woke up went somewhere.
// Only the herd you are standing with is awake; the other twenty-odd sleep on purpose. And a bell that woke on
// the last frame has had no time to go anywhere, so the question is put to the ones that had the time: did
// every bell that was awake for five seconds or more actually walk?
const walked = travel.filter((_, i) => awakeFrames[i] >= 600);
const idleWorst = idleMax;
// Count consecutive, not accumulated, still frames: adding scattered slow frames and calling the sum "the
// longest standstill" made a creature that kept moving look frozen for ten seconds.
ok('and no animal is ever frozen in a walking mode', idleWorst < 240,
  'the longest an awake bell spent in walk without moving a twentieth of a millimetre: ' +
  (idleWorst / 120).toFixed(2) + ' s');
ok('and the herd you stand with actually walks', walked.filter(m => m > .025).length >= 3,
  walked.length + ' bells were awake for five seconds or more, ' + walked.filter(m => m > .025).length +
  ' of them walked; the most covered ' + (Math.max(...walked) * 1000).toFixed(0) + ' mm in 60 s');

// The cylinders are measured in world chords. A two-millimetre numerical allowance covers the tangent-box
// approximation, not a body-width of penetration; every one of the 7200 frames is included.
ok('and no two bodies are ever inside each other', bodyGap >= -.002,
  'closest pair over the whole minute: ' + (bodyGap * 1000).toFixed(1) + ' mm of daylight');
ok('and no animal is ever properly inside a tree, a boulder, a stone or a wall', solidGap >= -.002,
  'closest it came: ' + (solidGap * 1000).toFixed(1) + ' mm (' + solidAt + ')');

// ---- a walker standing still in a herd ----------------------------------------------------------------
// The animals are posts that move, and they must not shovel a standing person out of the way: a body that
// walks into you and keeps walking is a body that has not noticed you, which is exactly the design.
let worstShove = 0, worstControl = 0, worstExcess = -Infinity, pushedFrames = 0, checked = 0;
for (const d of bell.slice(0, 4)) {
  // Run the *same* ground twice. Remove the creatures for the control, but keep the real slope, walls and
  // stones: their own settling must not be attributed to an animal. Restore the same objects afterwards.
  const target = d.pos.clone();
  const savedBell = bell.splice(0), savedReefs = reefs.splice(0);
  stand(target, .060);
  for (let frame = 0; frame < 240; frame++) physicsStep(dt);
  const controlStart = state.direction.clone();
  for (let frame = 240; frame < 1140; frame++) physicsStep(dt);
  const control = controlStart.angleTo(state.direction) * R;
  bell.push(...savedBell); reefs.push(...savedReefs);
  stand(target, .060);
  for (let frame = 0; frame < 240; frame++) { updateBell(dt, frame * dt); updateReefs(dt, frame * dt); physicsStep(dt); }
  const at = state.direction.clone();
  for (let frame = 240; frame < 1140; frame++) {
    updateBell(dt, frame * dt); updateReefs(dt, frame * dt); physicsStep(dt);
    if (state.pushed > 0) pushedFrames++;
  }
  const drift = at.angleTo(state.direction) * R;
  worstShove = Math.max(worstShove, drift);
  worstControl = Math.max(worstControl, control);
  worstExcess = Math.max(worstExcess, drift - control);
  checked++;
}
// "停住有点突兀" — the stopping was a switch: a walk ended between two frames and the body was simply
// standing. The speed is eased now, so the hardest a frame may cut is a quarter of what the animal had.
ok('and no animal stops dead between two frames', worstDrop < .25,
  'the hardest single-frame cut was ' + (worstDrop * 100).toFixed(1) + '% of its speed of the frame before (' +
  worstDropAt.mode + ', from ' + (worstDropAt.prevVel * 1000).toFixed(1) + ' mm/s)');

// You should never see a herd that is not thinking: the wake radius was 620 mm (10.5 m) and the horizon from an
// eye 100 mm above a planet of radius 4.2 is 917 mm (15.6 m), so a band of ground was in plain sight and asleep.
{
  const target = bell[0].pos;
  const side = new THREE.Vector3(1, 0, 0).cross(target);
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1).cross(target);
  side.normalize();
  const spot = target.clone().addScaledVector(side, 1.2 / R).normalize();
  resetGroundMotion();
  keys.clear(); joystick.x = joystick.y = 0;
  state.mode = 'ground'; state.transition = null; state.direction.copy(spot);
  state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false;
  state.radius = R + heightAt(spot) + EYE; state.velocity = 0; state.grounded = true;
  bell.forEach(d => { d.awake = false; });
  for (let f = 0; f < 4; f++) { updateBell(dt, f * dt); updateReefs(dt, f * dt); }
  const awake = bell.filter(d => d.awake).length;
  ok('and a herd 1.2 world units away — in plain sight — is awake', awake > 0,
    awake + ' of ' + bell.length + ' bells are thinking at 20 m, past the horizon of the eye');
}

ok('a walker standing still beside a herd is not shovelled along', worstExcess < .004 && pushedFrames === 0,
  'over 7.5 s at ' + checked + ' positions, the worst herd drift was ' + (worstShove * 1000).toFixed(2) +
  ' mm; its same-ground controls reached ' + (worstControl * 1000).toFixed(2) + ' mm, worst paired excess ' +
  (worstExcess * 1000).toFixed(2) + ' mm, creature-push frames ' + pushedFrames);

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
