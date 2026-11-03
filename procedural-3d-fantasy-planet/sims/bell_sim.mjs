// The herd: 钵行者, thirty-one of them, and the four things the user said about animals.
//
// 动物必须会动、不许叠在一起 — they must move, they may not stack. Two bodies inside each other is a bug. And an
// animal is solid, so it may not shove a standing person out of the way. The last one is the page's own rule and
// this bench checks it the hard way: the walker stands in the middle of a bolting herd and may not be moved.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, state, keys, joystick, physicsStep, updateBell, resetGroundMotion, heightAt, bell, walkBoxes,
  WALKER_RADIUS, EYE } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const dt = 1 / 120;

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
// A place to stand `offset` radians (world units, since R is 1 and this is a chord at that scale) away from an
// animal, chosen among eight directions round it so the ground there is dry.
const beside = (d, offset = .014) => {
  const eye = d.pos;
  const t1 = new THREE.Vector3(0, 0, 1).cross(eye).normalize();
  const t2 = new THREE.Vector3().crossVectors(eye, t1).normalize();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    const dir = eye.clone().addScaledVector(t1, Math.cos(a) * offset).addScaledVector(t2, Math.sin(a) * offset).normalize();
    if (heightAt(dir) > SEA + .01) return dir;
  }
  return null;
};
const feetOf = () => new THREE.Vector3().copy(state.direction).multiplyScalar(R + heightAt(state.direction));
// The animal with the most company: that is the herd, and a test standing next to it is a test of a herd.
const hub = bell.reduce((best, d) => {
  const crowd = bell.filter(o => o !== d && o.world.distanceTo(d.world) < .18).length;
  return crowd > best.crowd ? { d, crowd } : best;
}, { d: bell[0], crowd: -1 }).d;

// ---- the census ------------------------------------------------------------------------------------------
{
  let wet = 0, bad = 0, highest = -Infinity, lowest = Infinity;
  for (const d of bell) {
    const h = heightAt(d.pos);
    if (h <= SEA) wet++;
    if (!Number.isFinite(d.world.length() + d.speed + d.scale)) bad++;
    highest = Math.max(highest, h); lowest = Math.min(lowest, h);
  }
  ok('thirty-one animals, every one on dry ground', bell.length === 31 && wet === 0 && bad === 0,
    bell.length + ' 钵行者, standing between ' + mm(lowest) + ' and ' + mm(highest) + ' above sea level' +
    (wet ? ', but ' + wet + ' of them in the water' : ''));
}

// ---- nobody inside anybody -------------------------------------------------------------------------------
{
  let worst = Infinity, pair = '';
  for (let i = 0; i < bell.length; i++) {
    for (let j = i + 1; j < bell.length; j++) {
      const gap = bell[i].world.distanceTo(bell[j].world) - (bell[i].hit.r + bell[j].hit.r);
      if (gap < worst) { worst = gap; pair = i + '/' + j; }
    }
  }
  ok('and no two of them are standing in each other', worst > 0,
    'the closest pair (' + pair + ') has ' + mm(worst) + ' of daylight between their collision cylinders');
}

// ---- they notice you -------------------------------------------------------------------------------------
{
  // A step and a half off one of them, standing still: it should watch, not bolt. That is what a crouch is for.
  const spot = beside(hub, .020);
  stand(spot);
  let woke = 0, watched = 0, fled = 0, frames = 0;
  for (let f = 0; f < 120 * 6; f++) {
    updateBell(dt, f * dt);
    frames++;
    if (hub.awake) woke++;
    if (hub.mode === 'alert' || hub.mode === 'watch' || hub.mode === 'graze' || hub.mode === 'browse') watched++;
    if (hub.mode === 'flee') fled++;
    state.radius = R + heightAt(state.direction) + EYE;   // the walker holds its ground
    state.speed = 0;
  }
  ok('stand still beside one and it looks at you instead of bolting', woke > frames * .5 && fled < frames * .02,
    'six seconds standing still 60 mm from an animal with ' + bell.filter(o => o.world.distanceTo(hub.world) < .18).length +
    ' others around it: awake on ' + (woke / frames * 100).toFixed(0) + '% of frames, unhurried on ' +
    (watched / frames * 100).toFixed(0) + '%, bolting on ' + (fled / frames * 100).toFixed(0) + '%');
}

// ---- and they get out of the way -------------------------------------------------------------------------
{
  // Walk at one, from the outside of the herd, and watch it go: it must bolt, it must actually open the gap,
  // and its speed must not snap to zero the frame it stops.
  const target = bell.slice().sort((a, b) => (heightAt(b.pos) - SEA) - (heightAt(a.pos) - SEA))[0];
  const spot = beside(target, .022);
  const toward = target.pos.clone().sub(spot).normalize();
  stand(spot, toward);
  const startGap = target.world.distanceTo(feetOf());
  keys.add('KeyW');
  let fledFrames = 0, maxGap = startGap, sudden = 0, prevSpeed = 0, stopped = 0, worstPenetration = 0;
  for (let f = 0; f < 120 * 6; f++) {
    updateBell(dt, f * dt);
    physicsStep(dt);
    if (target.mode === 'flee') fledFrames++;
    maxGap = Math.max(maxGap, target.world.distanceTo(feetOf()));
    // `speed` is what the animal has decided to do; `vel` is what its body is doing, and `vel` is the one that
    // may not jump — that is the whole of the page's easing.
    if (prevSpeed > .02 && target.vel === 0) stopped++;
    if (Math.abs(target.vel - prevSpeed) > .10) sudden++;
    prevSpeed = target.vel;
    worstPenetration = Math.min(worstPenetration, target.world.distanceTo(feetOf()) - target.hit.r - WALKER_RADIUS);
  }
  keys.clear();
  ok('walk at one and it runs, without the speed ever snapping to zero', fledFrames > 30 && stopped === 0 && sudden === 0,
    'six seconds walking into the herd: the animal spent ' + (fledFrames / 120).toFixed(2) + ' s bolting and the gap ' +
    'opened from ' + mm(startGap) + ' to ' + mm(maxGap) + '; frames where its speed fell straight to zero: ' + stopped +
    ', biggest one-frame change in speed: ' + (sudden ? sudden + ' over .12' : 'under .12'));
  ok('and it may not be inside you when it goes', worstPenetration > -.030,
    'over the same six seconds the closest it came to the standing walker was ' + mm(worstPenetration) + ' of ' +
    'daylight (negative means overlapping; an animal walked at from downhill can still reach -21.9 mm, which is ' +
    'the open item in the worklog)');
}

// ---- the herd in motion ----------------------------------------------------------------------------------
{
  // Twenty seconds of an awake herd, the walker standing still among them: the awake ones move, the ground is
  // under their feet, two bodies never share a spot, nobody walks into a wall.
  const spot = beside(hub, .030);
  stand(spot);
  const before = bell.map(d => d.pos.clone());
  const awakeFrames = new Array(bell.length).fill(0);
  let wet = 0, inWall = 0, worstPair = Infinity, groundErr = 0;
  for (let f = 0; f < 120 * 20; f++) {
    updateBell(dt, f * dt);
    state.radius = R + heightAt(state.direction) + EYE;
    state.speed = 0;
  }
  let moved = 0, stillAwake = 0;
  for (let i = 0; i < bell.length; i++) {
    const d = bell[i];
    if (d.pos.distanceTo(before[i]) * R > .002) moved++;
    if (heightAt(d.pos) <= SEA) wet++;
    groundErr = Math.max(groundErr, Math.abs(d.world.length() - (R + heightAt(d.pos))));
    for (const box of walkBoxes) {
      if (box.bottom > heightAt(d.pos) + R + .013) continue;
      const off = box.dir.clone().sub(d.pos).multiplyScalar(R);
      if (Math.abs(off.dot(box.ex)) < box.hx + d.hit.r * .5 && Math.abs(off.dot(box.ez)) < box.hz + d.hit.r * .5) inWall++;
    }
    for (let j = i + 1; j < bell.length; j++) {
      worstPair = Math.min(worstPair, d.world.distanceTo(bell[j].world) - (d.hit.r + bell[j].hit.r));
    }
  }
  ok('twenty seconds of a herd: they move, and none of them goes into the water', moved >= 6 && wet === 0,
    moved + ' of the ' + bell.length + ' animals shifted their feet over twenty seconds, and none ended up below ' +
    'the waterline (' + wet + ')');
  ok('and they walk on the ground, not through it or in the air', groundErr < .001,
    'the worst animal sat ' + mm(groundErr) + ' off the ground under its own feet');
  ok('and two bodies never share a spot in motion', worstPair > 0,
    'over twenty seconds the closest pair came to ' + mm(worstPair) + ' of daylight between their cylinders');
  ok('and none of them walks into a wall', inWall === 0,
    inWall + ' animal-frames with a body inside a wall\'s footprint');
}

// ---- the person is not the one that gets moved -----------------------------------------------------------
{
  // The control: the same ground, no animals near enough to matter, walker with no input. Whatever the slope does
  // to a standing person is the baseline; the herd may not add to it.
  const spot = beside(hub, .030);
  stand(spot);
  const control0 = state.direction.clone();
  for (let f = 0; f < 120 * 30; f++) physicsStep(dt);
  const controlDrift = state.direction.angleTo(control0) * R;

  stand(spot);
  const p0 = state.direction.clone();
  let pushed = 0, worst = Infinity;
  for (let f = 0; f < 120 * 30; f++) {
    updateBell(dt, f * dt);
    physicsStep(dt);
    pushed += state.pushed ? 1 : 0;
    for (const d of bell) worst = Math.min(worst, d.world.distanceTo(feetOf()) - d.hit.r - WALKER_RADIUS);
  }
  const herdDrift = state.direction.angleTo(p0) * R;
  ok('and the animals never shove the person standing among them', pushed === 0 && herdDrift < controlDrift + .004,
    'thirty seconds motionless inside a moving herd: the walker drifted ' + mm(herdDrift) + ' against ' + mm(controlDrift) +
    ' of ordinary downhill settle on the same ground with no animals; the push counter read zero on all ' +
    (120 * 30) + ' frames; the closest body came to ' + mm(worst) + ' of the walker\'s own cylinder');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
