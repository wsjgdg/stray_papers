// The order the page's frame is assembled in, and the one thing that must be true after all of it: the eye is
// above the ground it is standing on, and no number anywhere has turned into NaN.
//
// This is the catch-all the other suites are not: they each drive one system. Here every system runs in the same
// frame in the same order the page runs it, for ten seconds, while the walker moves and the weather turns.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, camera, scene, state, keys, joystick, physicsStep, updateBell, updateReefs, updateWeather, settlementDirs,
  updateLattice, latticeRings, resetGroundMotion, heightAt, landing, EYE } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const dt = 1 / 120;

// A heading that gives a long walk rather than an immediate wall: the middle of the first province.
const heading = landing.clone();
// The same standing pose steps_sim uses: every field physicsStep reads has to be set, or the walker's radius
// turns into nonsense on the first frame.
const stand = (dir) => {
  resetGroundMotion(); keys.clear(); joystick.x = joystick.y = 0;
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
stand(heading);
keys.add('KeyW');
keys.add('ShiftLeft');

// ---- one full frame, 120 times a second for ten seconds ----------------------------------------------------
{
  let frames = 0, worstSink = 0, nanFrames = 0, belowGroundFrames = 0;
  let minEye = Infinity, maxSpeed = 0;
  let last = state.direction.clone();
  const m = new THREE.Matrix4();
  for (let f = 0; f < 120 * 10; f++) {
    // The page runs updateCamera (and its fixed-step walker) before updateWorld. Then the weather and net
    // advance, followed by the herd and rafts. Reversing these hides one-frame contact-order regressions.
    physicsStep(dt);
    camera.position.copy(state.direction).multiplyScalar(state.radius);
    camera.lookAt(new THREE.Vector3().copy(camera.position).add(new THREE.Vector3(0, 1, 0)));
    camera.updateMatrixWorld(true);
    updateWeather(dt);
    updateLattice(f * dt, 1, 0, state.direction, 0);
    updateBell(dt, f * dt);
    updateReefs(dt, f * dt);
    frames++;

    const ground = Math.max(heightAt(state.direction), SEA);
    const eye = state.radius - R;
    const sink = ground - eye;                       // positive means the eye is inside the ground
    worstSink = Math.max(worstSink, sink);
    minEye = Math.min(minEye, eye);
    if (sink > .001) belowGroundFrames++;
    if (!Number.isFinite(camera.position.x + camera.position.y + camera.position.z) ||
        !Number.isFinite(state.radius) || !Number.isFinite(state.direction.length())) nanFrames++;
    maxSpeed = Math.max(maxSpeed, last.distanceTo(state.direction) * R / dt);
    last.copy(state.direction);
  }
  ok('ten seconds of a real frame leaves no NaN anywhere', nanFrames === 0,
    frames + ' frames with weather, the net, the animals, the reefs and the walker all advancing: camera at ' +
    camera.position.toArray().map(v => v.toFixed(3)).join(', ') + ', radius ' + state.radius.toFixed(4));
  ok('and the eye never ends a frame below the ground', belowGroundFrames === 0,
    'the worst frame put the eye ' + mm(worstSink) + ' inside the ground; the eye was never lower than ' +
    mm(minEye) + ' above sea level over a sprinting walk');
  ok('and the walker went somewhere', state.direction.angleTo(heading) > .01,
    'turned ' + (state.direction.angleTo(heading) * 180 / Math.PI).toFixed(2) + '° from the start heading at up to ' +
    mm(maxSpeed) + '/s, ' + mm(state.radius - R - Math.max(heightAt(state.direction), SEA)) + ' above the ground at the end');
}

// ---- the panels are where the camera is looking ----------------------------------------------------------
{
  // The net's whole job: at the places the player actually stands, with their head up, more than a dozen panels
  // are in the sky above the horizon — not behind the planet. Measured at the spawn point and at each of the five
  // provinces' own ground.
  const spots = [{ name: 'the spawn point', dir: heading.clone() }];
  for (let i = 0; i < 5; i++) spots.push({ name: 'town ' + (i + 1), dir: settlementDirs[i].dir.clone() });
  const rows = [];
  let fewest = Infinity;
  const zen = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const spot of spots) {
    stand(spot.dir);
    updateLattice(0, 0, 0, state.direction, 0);
    const eye = new THREE.Vector3().copy(state.direction).multiplyScalar(state.radius);
    zen.copy(state.direction);
    let up = 0;
    for (const ring of latticeRings) {
      for (let k = 0; k < ring.mesh.count; k++) {
        ring.mesh.getMatrixAt(k, m);
        p.setFromMatrixPosition(m).applyMatrix4(ring.mesh.matrixWorld).sub(eye).normalize();
        // Above the tangent plane at the eye: the camera can see it at all. Anything on the far side of the
        // planet is behind the horizon, and looking up cannot bring it back.
        if (p.angleTo(zen) < Math.PI / 2) up++;
      }
    }
    rows.push(spot.name + ' ' + up);
    fewest = Math.min(fewest, up);
  }
  ok('and where the player stands, a dozen panels are up in the sky', fewest >= 12,
    'of the 164 panels, above the horizon at night: ' + rows.join(', '));
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
