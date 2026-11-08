// Bodies touching bodies — the edge of it, from the walker's side.
//
// `herd_sim` watches the animals on their own: that they walk, that they never end up inside a tree or inside
// each other, that they do not stop dead. What it cannot see is the player, and four of the user's rules are
// about the player: an animal may not be walked through, may not walk through you, and may not shove you out of
// the way (动物是实体 → 不许反过来把站着的人拱走). This suite stands a body in the herd and walks it at things.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, EYE, WALKER_RADIUS, BELL_HALF_WIDE, heightAt, state, keys, joystick, physicsStep,
  updateBell, updateReefs, resetGroundMotion, bell, reefs, walkBoxes, hardProps, stoneSolids, overlapAt } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const dt = 1 / 120;
// The page's own collision post for an animal — the radius it actually pushes the walker out to. Using the
// model's half width instead (as an earlier draft of this suite did) measures a circle nobody collides with.
const HALF = d => (d.hit && d.hit.r) || BELL_HALF_WIDE * (d.scale || 1);

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
};

// ---- standing in the herd -------------------------------------------------------------------------------
// The spot is chosen to be clear of every animal by a body's width, so the frame being measured is the herd
// walking past the player and not the player being placed inside one.
{
  const host = bell[0].pos.clone();
  let spot = null;
  for (let attempt = 0; attempt < 60 && !spot; attempt++) {
    const side = new THREE.Vector3(1, 0, 0).cross(host).normalize();
    const north = new THREE.Vector3().crossVectors(host, side).normalize();
    const a = attempt * 1.1, d = .075 + attempt * .002;
    const candidate = host.clone().addScaledVector(side, Math.cos(a) * d / R).addScaledVector(north, Math.sin(a) * d / R).normalize();
    if (heightAt(candidate) < SEA + .01) continue;
    if (bell.some(b => b.pos.dot(candidate) > .9999 && b.pos.distanceTo(candidate) * R < HALF(b) + WALKER_RADIUS + .010)) continue;
    if (hardProps.some(p => p.dir.distanceTo(candidate) * R < p.r + WALKER_RADIUS + .006)) continue;
    spot = candidate;
  }
  stand(spot);
  const start = state.direction.clone();
  let worstPush = 0, worstDrift = 0, closest = Infinity, awakeSeen = 0;
  for (let f = 0; f < 120 * 60; f++) {
    updateBell(dt, f * dt);
    updateReefs(dt, f * dt);
    physicsStep(dt);
    worstPush = Math.max(worstPush, state.pushed);
    worstDrift = Math.max(worstDrift, start.angleTo(state.direction) * R);
    const feet = R + heightAt(state.direction);
    for (const b of bell) if (b.pos.dot(state.direction) > .98) {
      if (b.awake) awakeSeen++;
      // Only a body the walker's own height would meet counts: a bell standing lower down the slope is one you
      // step past, exactly as the collision pass decides.
      if (!b.hit || b.hit.top <= feet + .02 || (b.hit.bottom !== null && b.hit.bottom > feet + .085)) continue;
      closest = Math.min(closest, b.pos.distanceTo(state.direction) * R - HALF(b) - WALKER_RADIUS);
    }
  }
  ok('a standing body is never shovelled by the herd', worstPush === 0 && worstDrift < .0005,
    'sixty seconds standing in a herd that was awake for ' + awakeSeen + ' animal-frames: the body moved ' +
    mm(worstDrift) + ', and no animal moved it at all');
  // The old threshold allowed a whole body to overlap, and the old number was a unit-sphere chord rather than
  // a world distance. The margin is now measured in the same world chord as the actual collision radii.
  ok('and an animal does not enter the standing body', closest > -.002,
    'the nearest any animal body came to the player\'s own was ' + (closest === Infinity ? 'never within sight' : mm(closest)) +
    ' — measured edge to edge against the page\'s own collision post, so a positive number is daylight');
}

// ---- walking at an animal -------------------------------------------------------------------------------
{
  // A body that is out on its own, approached from a clear side. Three seconds of W: it must be stopped by the
  // animal, and stopped *at* it — getting 50 mm away would be as wrong as passing through.
  let chosen = null, fromBest = null;
  for (const candidate of bell) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const side = new THREE.Vector3(1, 0, 0).cross(candidate.pos).normalize();
      const north = new THREE.Vector3().crossVectors(candidate.pos, side).normalize();
      const a = attempt * 0.9;
      const start = candidate.pos.clone().addScaledVector(side, Math.cos(a) * .075 / R).addScaledVector(north, Math.sin(a) * .075 / R).normalize();
      if (heightAt(start) < SEA + .01) continue;
      if (hardProps.some(p => p.dir.distanceTo(start) * R < p.r + .02)) continue;
      if (!candidate.hit || candidate.hit.top <= R + heightAt(start) + .05) continue;   // one you would walk over
      let clearPath = true;
      for (let k = 1; k <= 8; k++) {
        const along = start.clone().lerp(candidate.pos, k / 8).normalize();
        if (hardProps.some(p => p.dir.distanceTo(along) * R < p.r + .012) || walkBoxes.some(b => {
          const off = b.dir.clone().sub(along).multiplyScalar(R);
          return Math.abs(off.dot(b.ex)) < b.hx && Math.abs(off.dot(b.ez)) < b.hz;
        })) { clearPath = false; break; }
      }
      if (!clearPath) continue;
      chosen = candidate; fromBest = start;
      break;
    }
    if (chosen) break;
  }
  if (!chosen) ok('the walker cannot walk through an animal', false, 'no animal with a clear approach found');
  else {
    stand(fromBest, chosen.pos.clone().sub(fromBest).normalize());
    keys.add('KeyW');
    let closest = Infinity, met = 0;
    const animalStart = chosen.pos.clone(), phaseStart = chosen.phase;
    for (let f = 0; f < 120 * 3; f++) {
      updateBell(dt, f * dt);
      physicsStep(dt);
      // Only frames where the animal is at the walker's own height: one standing downhill is a thing you step
      // past, and the collision pass says so too (`hit.top <= feet`).
      const feet = R + heightAt(state.direction);
      if (!chosen.hit || chosen.hit.top <= feet + .02) continue;
      met++;
      closest = Math.min(closest, chosen.pos.distanceTo(state.direction) * R - HALF(chosen) - WALKER_RADIUS);
    }
    keys.clear();
    ok('the walker cannot walk through an animal', met > 0 && closest > -.002,
      met === 0 ? 'the animal was never at the walker\'s height, so there was nothing to walk into'
        : 'on ' + met + ' frames of standing at it, the closest the body came to the animal\'s edge was ' +
          mm(closest));
    const travelled = animalStart.distanceTo(chosen.pos) * R, stride = chosen.phase - phaseStart;
    ok('the animal makes room with a walking stride when approached', travelled > .020 && stride > .5,
      'the approached animal moved ' + mm(travelled) + ' and advanced its stride by ' + stride.toFixed(2) + ' rad');
  }
}

// A controlled contact, deliberately 4 mm inside an animal, with the real frame order: physics first,
// then the animals. It catches the old behaviour where an animal shuffled into a stationary body and the
// physics pass shoved the camera away. The animal has to retreat and animate; suppressing push alone is not enough.
{
  let chosen = null, spot = null;
  for (const d of bell) {
    const east = new THREE.Vector3(1, 0, 0).cross(d.pos).normalize();
    const north = new THREE.Vector3().crossVectors(d.pos, east).normalize();
    for (let k = 0; k < 24; k++) {
      const a = k * Math.PI / 12, reach = d.hit.r + WALKER_RADIUS - .004;
      const p = d.pos.clone().addScaledVector(east, Math.cos(a) * reach / R)
        .addScaledVector(north, Math.sin(a) * reach / R).normalize();
      const feet = R + heightAt(p);
      if (heightAt(p) < SEA + .010 || d.hit.top <= feet || overlapAt(p, feet) > 0) continue;
      if (bell.some(o => o !== d && o.pos.distanceTo(p) * R < o.hit.r + WALKER_RADIUS + .015)) continue;
      if (stoneSolids.some(x => x.dir.distanceTo(p) * R < x.r + WALKER_RADIUS + .005)) continue;
      chosen = d; spot = p; break;
    }
    if (chosen) break;
  }
  if (!chosen) ok('a stationary walker is held while the overlapping animal steps away', false, 'no clear contact site');
  else {
    stand(spot);
    chosen.speed = 0; chosen.vel = 0; chosen.mode = 'graze'; chosen.timer = 2;
    const playerStart = state.direction.clone(), animalStart = chosen.pos.clone(), phaseStart = chosen.phase;
    const initialGap = chosen.pos.distanceTo(state.direction) * R - chosen.hit.r - WALKER_RADIUS;
    let pushFrames = 0, maxStep = 0, last = chosen.pos.clone();
    for (let f = 0; f < 60; f++) {
      for (let step = 0; step < 2; step++) { physicsStep(dt); if (state.pushed > 0) pushFrames++; }
      updateBell(1 / 60, f / 60);
      maxStep = Math.max(maxStep, last.distanceTo(chosen.pos) * R); last.copy(chosen.pos);
    }
    const finalGap = chosen.pos.distanceTo(state.direction) * R - chosen.hit.r - WALKER_RADIUS;
    const playerDrift = playerStart.distanceTo(state.direction) * R;
    const animalTravel = animalStart.distanceTo(chosen.pos) * R, stride = chosen.phase - phaseStart;
    ok('a stationary walker is held while the overlapping animal steps away',
      initialGap < -.003 && finalGap > 0 && playerDrift < .001 && pushFrames === 0 && animalTravel > .010 && stride > .3 && maxStep < .020,
      'gap ' + mm(initialGap) + ' → ' + mm(finalGap) + ', walker drift ' + mm(playerDrift) +
      ', push frames ' + pushFrames + ', animal travel ' + mm(animalTravel) + ', stride ' + stride.toFixed(2) +
      ' rad, biggest 60 Hz step ' + mm(maxStep));
  }
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
