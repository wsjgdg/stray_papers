// Every solid in the world, as the page itself records it.
//
// `-59` promised "every solid has volume" and `-66` gave the walls a bottom. Both are statements about a
// list, so this suite reads the list: every trunk, boulder, crystal and sea stone; every wall of every town;
// every animal and every raft. It also stands a body inside a hundred of them and checks that the page pushes
// it out, because a solid that cannot push you out is a decoration with a collision flag.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, WALKER_RADIUS, heightAt, state, keys, joystick, physicsStep, resetGroundMotion,
  hardProps, stoneSolids, walkBoxes, bell, reefs, overlapAt } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';

// ---- posts ----------------------------------------------------------------------------------------------
{
  let empty = 0, worst = null;
  for (const post of [...hardProps, ...stoneSolids]) {
    if (!(post.r > 0)) { empty++; if (!worst) worst = post; }
  }
  ok('every trunk, boulder, crystal and sea stone has a width', empty === 0,
    hardProps.length + ' props and ' + stoneSolids.length + ' sea stones, all with a radius; the narrowest is ' +
    mm(Math.min(...hardProps.map(p => p.r), ...stoneSolids.map(p => p.r))) +
    ' and the widest ' + mm(Math.max(...hardProps.map(p => p.r), ...stoneSolids.map(p => p.r))));
}

// ---- walls ----------------------------------------------------------------------------------------------
{
  let notUnit = 0, notSquare = 0, degenerate = 0, floating = 0, buried = 0, low = 0;
  let worstUnit = 0, worstSquare = 0, worstFloat = -Infinity;
  for (const box of walkBoxes) {
    const e = Math.max(Math.abs(box.ex.length() - 1), Math.abs(box.ez.length() - 1));
    worstUnit = Math.max(worstUnit, e);
    if (e > 1e-5) notUnit++;
    const dot = Math.abs(box.ex.dot(box.ez));
    worstSquare = Math.max(worstSquare, dot);
    if (dot > 1e-5) notSquare++;
    if (!(box.hx > 0) || !(box.hz > 0) || !(box.top > box.bottom)) degenerate++;
    const ground = R + heightAt(box.dir);
    // The build keeps a piece only if it stands on the ground (its base is within twelve millimetres of it)
    // and if it comes up past the walker's chest. Both are walls' worth checking: `-30` shipped houses whose
    // base floated a hundred and ninety millimetres over the slope.
    if (box.bottom > ground + .013) { floating++; worstFloat = Math.max(worstFloat, box.bottom - ground); }
    if (box.bottom < ground - .120) buried++;
    if (box.top < ground + .045) low++;
  }
  ok('every wall is a real rectangle: two unit axes, square to each other', notUnit === 0 && notSquare === 0,
    walkBoxes.length + ' boxes; worst axis off unit by ' + worstUnit.toExponential(1) +
    ', worst off square by ' + worstSquare.toExponential(1));
  ok('and has volume: both half-widths and a top above its bottom', degenerate === 0,
    degenerate + ' boxes with no width or no height');
  ok('and stands on the ground it was built on', floating === 0,
    'the highest any wall base sits above its own ground: ' + mm(Math.max(0, worstFloat)) +
    ' (the build allows twelve). ' + buried + ' boxes start more than a hundred and twenty millimetres under ' +
    'the ground at their own centre line, which is a foundation running down a slope, not a floating house');
  ok('and is tall enough that it is a wall and not a kerb', low === 0,
    low + ' boxes top out below the height of the walker chest');
}

// ---- animals --------------------------------------------------------------------------------------------
{
  let bad = 0, narrowest = Infinity, thinnest = Infinity;
  for (const body of [...bell, ...reefs]) {
    const hit = body.hit;
    if (!hit || !(hit.r > 0) || !(hit.top > hit.bottom)) { bad++; continue; }
    narrowest = Math.min(narrowest, hit.r);
    thinnest = Math.min(thinnest, hit.top - hit.bottom);
  }
  ok('every animal and every raft is a body, not a point', bad === 0,
    bell.length + ' bells and ' + reefs.length + ' rafts; the narrowest is ' + mm(narrowest) +
    ' across and the thinnest ' + mm(thinnest) + ' tall');
}

// ---- and all of it pushes a body out ---------------------------------------------------------------------
// A hundred places where the body is inside something, chosen the way the world is: find a solid, stand on
// top of it. Then let the page resolve it. This is the invariant the user feels as "不许穿模".
{
  const dt = 1 / 120;
  let tried = 0, worst = Infinity, stuck = 0, stillInAny = 0, deepestAny = 0;
  let seed = 424242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let attempt = 0; attempt < 4000 && tried < 100; attempt++) {
    const post = hardProps[Math.floor(rnd() * hardProps.length)];
    if (!post || !(post.r > .004)) continue;
    // Inside it, not dead centre: a body exactly on the axis is a degenerate case with no "outwards" at all.
    const side = new THREE.Vector3(1, 0, 0).cross(post.dir);
    if (side.lengthSq() < 1e-8) side.set(0, 0, 1).cross(post.dir);
    const other = new THREE.Vector3().crossVectors(post.dir, side.normalize());
    const off = (.25 + rnd() * .65) * post.r;
    const dir = post.dir.clone().addScaledVector(side, Math.cos(rnd() * 6.28) * off / R)
      .addScaledVector(other, Math.sin(rnd() * 6.28) * off / R).normalize();
    const feet = R + heightAt(dir);
    if (post.top !== undefined && post.top <= feet) continue;
    resetGroundMotion();
    keys.clear(); joystick.x = joystick.y = 0;
    state.mode = 'ground'; state.transition = null;
    state.direction.copy(dir);
    state.radius = feet + EYE;
    state.heading.set(0, 1, 0).cross(dir).normalize();
    state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
    state.velocity = 0; state.grounded = true; state.moveVelocity.set(0, 0, 0);
    state.feetRadius = feet;
    if (overlapAt(state.direction, state.feetRadius) <= 0) continue;      // not actually inside anything
    tried++;
    // How deep it started, so the answer can be "it got out" rather than "it got out of everything", which in
    // a cluster of boulders built one against the other is not a place that exists.
    const inside0 = post.r + WALKER_RADIUS - post.dir.distanceTo(state.direction) * R;
    for (let f = 0; f < 12; f++) physicsStep(dt);
    // Two questions, and they are different. Out of the trunk it was standing in: that is the promise, and
    // it has to hold. Out of *everything*: in a cluster of three overlapping boulders there may be no point
    // that is outside all of them within a step's reach, and the body ends up in the widest gap instead.
    const gap = post.dir.distanceTo(state.direction) * R - post.r - WALKER_RADIUS;
    if (gap < worst) worst = gap;
    // The promise: a body dropped inside a boulder is most of the way out of it within a tenth of a second,
    // whatever else is built against it.
    if (gap < -inside0 * .35) stuck++;
    const any = overlapAt(state.direction, state.feetRadius);
    if (any > 0) { stillInAny++; deepestAny = Math.max(deepestAny, any); }
  }
  ok('a body put inside a solid is pushed out of that solid', tried > 20 && stuck === 0,
    tried + ' bodies stood inside trunks and boulders; a tenth of a second later the deepest still inside the one it was in is ' + mm(Math.max(0, -worst)) +
    ' — ' + (tried - stuck) + ' of ' + tried + ' are most of the way out, and ' + stillInAny +
    ' finish inside a neighbour, because those boulders were built in clusters');
}

// ---- H, the way out -----------------------------------------------------------------------------------
// The walls are solid, and a lane can be too narrow to leave: the user asked for a key that walks through
// everything except the ground. This is that key, measured — and measured against the same walk without it,
// so the pair proves the wall was there in the first place.
{
  const dt = 1 / 120;
  // A wall whose two sides are on the same footing, so the walk is a walk and not a fall off a ledge.
  let wall = null;
  for (const box of walkBoxes) {
    const centre = R + heightAt(box.dir);
    if (box.bottom > centre + .013 || box.top < centre + .06) continue;
    const out = box.ex.clone().multiplyScalar((box.hx + .045) / R);
    const front = box.dir.clone().add(out).normalize();
    const back = box.dir.clone().addScaledVector(out, -1).normalize();
    if (heightAt(front) < SEA + .004 || heightAt(back) < SEA + .004) continue;
    if (Math.abs(heightAt(front) - heightAt(back)) > .010) continue;
    if (overlapAt(front, R + heightAt(front)) > 0 || overlapAt(back, R + heightAt(back)) > 0) continue;
    wall = { box, front, back };
    break;
  }
  const walk = (ghost, frames) => {
    resetGroundMotion();
    keys.clear(); joystick.x = joystick.y = 0;
    state.mode = 'ground'; state.transition = null;
    state.direction.copy(wall.front);
    state.radius = R + heightAt(wall.front) + EYE;
    // face the wall: the tangent from here to the far side
    state.heading.copy(wall.back).sub(state.direction);
    state.heading.addScaledVector(state.direction, -state.heading.dot(state.direction)).normalize();
    state.water = false; state.depth = 0; state.swimBlend = 0; state.submerged = false; state.crouch = 0;
    state.velocity = 0; state.grounded = true; state.moveVelocity.set(0, 0, 0); state.ghost = ghost;
    state.feetRadius = R + heightAt(wall.front);
    if (ghost) keys.add('KeyH');
    keys.add('KeyW');
    let after = 0, worstEye = Infinity;
    for (let f = 0; f < frames; f++) {
      physicsStep(dt);
      worstEye = Math.min(worstEye, state.radius - R - heightAt(state.direction));
    }
    // which side of the wall the body is on, in the box's own axis
    const off = wall.box.dir.clone().sub(state.direction).multiplyScalar(R);
    after = off.dot(wall.box.ex);
    keys.clear();
    state.ghost = false;
    return { after, half: wall.box.hx, moved: wall.front.angleTo(state.direction) * R, worstEye };
  };
  const solid = wall ? walk(false, 120) : null;
  const ghost = wall ? walk(true, 120) : null;
  ok('a wall stops a walker who is not phasing', !!wall && solid.after < -solid.half,
    wall ? 'walked at the face for a second and stopped ' + mm(-solid.after - solid.half) +
      ' outside it — its own radius to the millimetre — having covered ' + mm(solid.moved) +
      ' of the ' + mm(2 * (solid.half + .045)) + ' it had to cross' : 'no wall found to test');
  ok('and holding H walks straight through it', !!ghost && ghost.after > ghost.half,
    wall ? 'the same second of walking with H held carried the body ' + mm(ghost.after - ghost.half) +
      ' past the far face (' + mm(ghost.moved) + ' covered)' : 'no wall found to test');
  ok('and the ground still holds a ghost up', !!ghost && ghost.worstEye > EYE - .003,
    ghost ? 'the eye never came closer than ' + mm(ghost.worstEye) + ' to the ground it was walking on' : '');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
