// Regression fixtures for collision heights, solid tops, and bounded recovery. These are recorded geometry
// and states, not a copy of an old HTML page: the page under test supplies the actual physics and terrain.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, WALKER_RADIUS, SPRINT_SPEED, landing, heightAt, state, keys, joystick,
  physicsStep, resetGroundMotion, overlapAt, hardProps, stoneSolids, walkBoxes, bell, reefs } = world;
const dt = 1 / 120;
const stepLimit = SPRINT_SPEED * 1.18 * dt + .0016;
const mm = n => (n * 1000).toFixed(2) + ' mm';
const v = a => new THREE.Vector3(...a).normalize();
let pass = 0, fail = 0;
const ok = (name, cond, info) => {
  if (cond) { pass++; console.log('  PASS ' + name + ' — ' + info); }
  else { fail++; console.log('  FAIL ' + name + ' — ' + info); }
};

// Isolate the recorded cases from unrelated generated props, then put the actual world back for the roof.
const lists = [hardProps, stoneSolids, walkBoxes, bell, reefs];
const originals = lists.map(list => [...list]);
const clearWorld = () => lists.forEach(list => { list.length = 0; });
const restoreWorld = () => lists.forEach((list, i) => list.splice(0, list.length, ...originals[i]));
const setup = (dir, feet, velocity = 0, grounded = false) => {
  resetGroundMotion(); keys.clear(); joystick.x = joystick.y = 0;
  state.mode = 'ground'; state.transition = null; state.ghost = false;
  state.direction.copy(dir); state.radius = feet + EYE; state.feetRadius = feet;
  state.heading.set(0, 1, 0).cross(dir).normalize();
  state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
  state.velocity = velocity; state.grounded = grounded; state.moveVelocity.set(0, 0, 0);
};
clearWorld();

// The recorded downhill sprint from the earlier layout. The actual feet are 65 mm above this stone,
// even though the terrain under the proposed next position drops below its top.
{
  const start = v([.0321960630498796, .4945620007110618, .8685458197336281]);
  const stone = { dir: v([.029135883742566364, .488860501645554, .8718752836325832]),
    r: .05747119263725691, top: 4.543949327788746 };
  stoneSolids.push(stone);
  setup(start, 4.7091017489777895 - EYE, -.315);
  state.moveVelocity.set(-.601473890079056, .19991011295716904, -.0915355901004886);
  state.heading.copy(state.moveVelocity).addScaledVector(start, -state.moveVelocity.dot(start)).normalize();
  keys.add('ShiftLeft'); keys.add('KeyW');
  const before = state.direction.clone(), feetBefore = state.radius - EYE;
  const horizontallyInside = start.distanceTo(stone.dir) * R < stone.r + WALKER_RADIUS;
  physicsStep(dt);
  const moved = before.distanceTo(state.direction) * R;
  const actualFeet = state.radius - EYE;
  ok('airborne sprint uses actual feet above a stone rather than the lower ground',
    horizontallyInside && feetBefore > stone.top + .05 && moved <= stepLimit &&
    Math.abs(state.feetRadius - actualFeet) < 1e-6 && actualFeet > stone.top,
    'feet ' + mm(feetBefore - stone.top) + ' above its top; moved ' + mm(moved) + ' (bound ' + mm(stepLimit) +
    '), exposed feet error ' + mm(Math.abs(state.feetRadius - actualFeet)));
  stoneSolids.length = 0;
}

// Merely using airborne height would defer the penetration until the body falls below the stone. It must
// actually land on the top, without a lateral push. H still deliberately phases through it to the ground.
{
  const ground = R + heightAt(landing);
  const stone = { dir: landing.clone(), r: .035, top: ground + .060 };
  stoneSolids.push(stone);
  setup(landing, stone.top + .050, -.1);
  let maxSlide = 0, maxPenetration = 0;
  for (let f = 0; f < 180; f++) {
    physicsStep(dt);
    maxSlide = Math.max(maxSlide, landing.distanceTo(state.direction) * R);
    if (landing.distanceTo(state.direction) * R < stone.r + WALKER_RADIUS)
      maxPenetration = Math.max(maxPenetration, stone.top - (state.radius - EYE));
  }
  ok('a falling body lands on the stone top instead of being pushed through or sideways',
    state.grounded && Math.abs(state.radius - EYE - stone.top) < 1e-6 && maxSlide < 1e-5 && maxPenetration < 1e-6,
    'resting feet error ' + mm(Math.abs(state.radius - EYE - stone.top)) + ', lateral drift ' + mm(maxSlide) +
    ', penetration ' + mm(maxPenetration));
  // A support must not glue the player down: jump from it, clear the top, and land on it again.
  state.velocity = .78; state.grounded = false;
  let jumpHeight = 0, jumpSlide = 0;
  for (let f = 0; f < 180; f++) {
    physicsStep(dt);
    jumpHeight = Math.max(jumpHeight, state.radius - EYE - stone.top);
    jumpSlide = Math.max(jumpSlide, landing.distanceTo(state.direction) * R);
  }
  ok('a jump from the stone returns to its top without a sideways shove',
    jumpHeight > .050 && jumpSlide < 1e-5 && state.grounded && Math.abs(state.radius - EYE - stone.top) < 1e-6,
    'peak above the top ' + mm(jumpHeight) + ', lateral drift ' + mm(jumpSlide));

  // Both crouching and standing change eye height. The support must follow the prior feet rather than
  // dropping the body below the top and then ejecting it when the eye rises.
  let crouchSlide = 0, crouchPenetration = 0;
  keys.add('KeyC');
  for (let f = 0; f < 240; f++) {
    if (f === 120) keys.delete('KeyC');
    physicsStep(dt);
    const eyeHeight = EYE + (world.CROUCH_EYE - EYE) * state.crouch;
    crouchSlide = Math.max(crouchSlide, landing.distanceTo(state.direction) * R);
    crouchPenetration = Math.max(crouchPenetration, stone.top - (state.radius - eyeHeight));
  }
  ok('crouching and standing on the stone keep the feet supported',
    state.grounded && state.crouch < .001 && Math.abs(state.radius - EYE - stone.top) < .0001 &&
    crouchSlide < 1e-5 && crouchPenetration < 1e-6,
    'lateral drift ' + mm(crouchSlide) + ', deepest below the top ' + mm(crouchPenetration));
  keys.add('KeyH');
  for (let f = 0; f < 180; f++) physicsStep(dt);
  ok('holding H still lets the body fall through the stone onto terrain',
    state.ghost && state.grounded && Math.abs(state.radius - EYE - ground) < 1e-6 &&
    landing.distanceTo(state.direction) * R < 1e-5,
    'feet ' + mm(state.radius - EYE - ground) + ' from ground, drift ' + mm(landing.distanceTo(state.direction) * R));
  stoneSolids.length = 0;
}

// The same support rule applies to solid boxes, not only round stones.
{
  const ground = R + heightAt(landing);
  const ex = new THREE.Vector3(0, 1, 0).cross(landing).normalize();
  const ez = new THREE.Vector3().crossVectors(landing, ex).normalize();
  const box = { dir: landing.clone(), ex, ez, hx: .045, hz: .040, bottom: ground - .020, top: ground + .120 };
  walkBoxes.push(box);
  setup(landing, box.top + .050, -.1);
  let maxSlide = 0, maxPenetration = 0;
  for (let f = 0; f < 180; f++) {
    physicsStep(dt);
    maxSlide = Math.max(maxSlide, landing.distanceTo(state.direction) * R);
    maxPenetration = Math.max(maxPenetration, box.top - (state.radius - EYE));
  }
  ok('a falling body also lands on a box top',
    state.grounded && Math.abs(state.radius - EYE - box.top) < 1e-6 && maxSlide < 1e-5 && maxPenetration < 1e-6,
    'resting feet error ' + mm(Math.abs(state.radius - EYE - box.top)) + ', lateral drift ' + mm(maxSlide) +
    ', penetration ' + mm(maxPenetration));
  let crouchSlide = 0, crouchPenetration = 0;
  keys.add('KeyC');
  for (let f = 0; f < 240; f++) {
    if (f === 120) keys.delete('KeyC');
    physicsStep(dt);
    const eyeHeight = EYE + (world.CROUCH_EYE - EYE) * state.crouch;
    crouchSlide = Math.max(crouchSlide, landing.distanceTo(state.direction) * R);
    crouchPenetration = Math.max(crouchPenetration, box.top - (state.radius - eyeHeight));
  }
  ok('crouching and standing on a box also keep the feet supported',
    state.grounded && state.crouch < .001 && Math.abs(state.radius - EYE - box.top) < .0001 &&
    crouchSlide < 1e-5 && crouchPenetration < 1e-6,
    'lateral drift ' + mm(crouchSlide) + ', deepest below the top ' + mm(crouchPenetration));
  walkBoxes.length = 0;
}

// A persistent copy of the previously stuck three-boulder pinch. The starting overlap is 2.297 mm;
// four-times-local-depth search alone never left this local minimum.
{
  const fixtures = [
    { dir: [.4722198347855264, .8796110399998724, .057383324628963076], r: .07300060122899935 },
    { dir: [.4565682091441287, .8850119947455823, .09110016221373284], r: .08512895974051102 },
    { dir: [.45319566323903143, .8891388888888889, .06360603027045875], r: .023993128870095515 }
  ];
  hardProps.push(...fixtures.map(p => ({ dir: v(p.dir), r: p.r })));
  const start = v([.4577444857789087, .886396656183997, .06907209020169938]);
  setup(start, R + heightAt(start), 0, true);
  keys.add('KeyH'); physicsStep(dt); keys.delete('KeyH');
  const initial = overlapAt(state.direction, state.feetRadius);
  let maxStep = 0, exitFrame = 0, reentered = false;
  for (let f = 0; f < 24; f++) {
    const before = state.direction.clone();
    physicsStep(dt);
    maxStep = Math.max(maxStep, before.distanceTo(state.direction) * R);
    const inside = overlapAt(state.direction, state.feetRadius);
    if (inside <= 1e-7 && !exitFrame) exitFrame = f + 1;
    if (inside > 1e-7 && exitFrame) reentered = true;
  }
  const remaining = overlapAt(state.direction, state.feetRadius);
  ok('releasing H in the three-boulder pinch clears every neighbour without a snap',
    initial > .002 && initial < .003 && remaining < 1e-7 && exitFrame > 0 && !reentered && maxStep <= .9 * dt + 1e-6,
    'initial overlap ' + mm(initial) + ', final ' + mm(remaining) + ', exit frame ' + exitFrame +
    ', largest step ' + mm(maxStep));
  hardProps.length = 0;
}

// This real wall and boulder sit over a rising slope. The wall bottom comes within 20 mm of the sampled
// terrain mid-step; the walker was previously clear, so resolving it across the room is not an escape.
{
  const box = {
    dir: v([.3432178466121149, -.5489600778241963, -.7621314471416301]),
    ex: v([-.4242405945954598, -.81453985198736, .39565736113675487]),
    ez: v([.8379865319110048, -.18753043080967446, .5124557638041594]),
    hx: .07458628830968507, hz: .05843808993803723, top: 4.560385968012882, bottom: 4.442434290356019
  };
  const post = { dir: v([.3665355879897358, -.540759573224932, -.7571200345405]), r: .047930039286736816 };
  walkBoxes.push(box); hardProps.push(post);
  const start = v([.3506853900699022, -.5448527165964, -.7616792464082528]);
  setup(start, 4.417496755771847, 0, true);
  state.heading.copy(v([-.3624741231349905, -.8289079530754516, .4260564697147366]));
  state.moveVelocity.set(-.09015513219156554, -.266444733835905, .14884209864540274);
  keys.add('KeyW');
  const initial = overlapAt(start, state.feetRadius), before = state.direction.clone();
  physicsStep(dt);
  const moved = before.distanceTo(state.direction) * R, remaining = overlapAt(state.direction, state.feetRadius);
  ok('a rising slope under a wall refuses the step instead of ejecting a clear walker',
    initial < 1e-7 && moved <= stepLimit && remaining < 1e-7,
    'started overlap ' + mm(initial) + ', moved ' + mm(moved) + ' (bound ' + mm(stepLimit) + '), final overlap ' + mm(remaining));
  walkBoxes.length = 0; hardProps.length = 0;
}

// The actual drowned-ruin roof is above the water even though its terrain is below the waterline. Walk off
// it into the sea: neither a 109 mm pose snap nor a frame embedded in the ruin is acceptable.
restoreWorld();
{
  const start = v([-.21945746374002614, .1839461803897851, -.9581243261335158]);
  const toward = v([-.22076160591311103, .18272816487515173, -.9580577911149325]);
  const roof = walkBoxes.find(box => Math.abs(box.top - 4.311149913345029) < 1e-8);
  const top = roof ? roof.top : 4.311149913345029;
  setup(start, top, 0, true);
  state.heading.copy(toward).addScaledVector(start, -toward.dot(start)).normalize();
  state.moveVelocity.copy(state.heading).multiplyScalar(.35532664195652064);
  keys.add('KeyW');
  let firstWater = null, firstDrop = 0, maxVertical = 0, maxPenetration = 0, wetFrames = 0;
  for (let f = 0; f < 180; f++) {
    const before = state.radius;
    physicsStep(dt);
    if (f === 0) { firstWater = state.water; firstDrop = before - state.radius; }
    maxVertical = Math.max(maxVertical, Math.abs(before - state.radius));
    maxPenetration = Math.max(maxPenetration, overlapAt(state.direction, state.feetRadius));
    if (state.water) wetFrames++;
  }
  ok('a dry ruin roof over water supports the walker before a smooth fall into the sea',
    !!roof && heightAt(start) < SEA - .006 && firstWater === false && Math.abs(firstDrop) < 1e-5 &&
    wetFrames > 0 && state.water && maxVertical < .012 && maxPenetration < 1e-6,
    'first drop ' + mm(firstDrop) + ', largest vertical frame ' + mm(maxVertical) +
    ', worst solid overlap ' + mm(maxPenetration) + ', water frames ' + wetFrames);
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
