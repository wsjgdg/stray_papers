// Real camera flights, driven with controlled frame timestamps. The renderer is a stub, but the
// transition interpolation, terrain clearance, timers, landing and teleport are the page's own code.
import { buildWorld } from './world.mjs';

let pass = 0, fail = 0;
const ok = (name, condition, info = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const w = await buildWorld();
const { state, camera, updateCamera, switchMode, landing, R, SEA, EYE, heightAt,
  teleportTo, mapAnchors, rebaseFrameClock } = w;
const clockStart = t => Number.isFinite(t.wallLastMs) ? t.wallLastMs : 100000;
const mm = x => (x * 1000).toFixed(2) + ' mm';

switchMode();
const landingFlight = state.transition, start = clockStart(landingFlight), path = [];
let leastGround = Infinity;
for (let f = 1; f <= 109 && state.transition; f++) {
  updateCamera(1 / 60, start + f * 1000 / 60);
  const dir = camera.position.clone().normalize();
  leastGround = Math.min(leastGround, camera.position.length() - (R + Math.max(SEA, heightAt(dir))));
  path.push(camera.position.clone());
}
const landingError = state.direction.distanceTo(landing) * R;
let largestStep = 0;
for (let i = 1; i < path.length; i++) largestStep = Math.max(largestStep, path[i].distanceTo(path[i - 1]));
ok('default descent follows its full 1.8 seconds at 60 Hz', landingFlight.duration === 1.8 &&
  !state.transition && path.length >= 108 && path.length <= 109 && landingError < 1e-6,
  path.length + ' frames; landing error ' + mm(landingError));
ok('the ordinary descent keeps the camera above terrain', leastGround >= EYE * .9 - 1e-8 && largestStep < .4,
  'lowest ground clearance ' + mm(leastGround) + ', largest camera interval ' + mm(largestStep));

// A 5 Hz device still has only nine visible frames in 1.8 s: no software can make them smooth.
// It must not artificially stretch each 200 ms interval to the physics clamp of 50 ms.
switchMode();
const returnFlight = state.transition, slowStart = clockStart(returnFlight);
let slowFrames = 0;
for (let f = 1; f <= 10 && state.transition; f++) { updateCamera(.05, slowStart + 200 * f); slowFrames++; }
ok('a 5 Hz return flight uses elapsed render time rather than the physics clamp', !state.transition && slowFrames <= 10,
  slowFrames + ' frames / ' + (slowFrames * .2).toFixed(1) + ' s, configured ' + returnFlight.duration + ' s');

// Isolate the next scenario even when a historical page failed to finish the previous flight.
if (state.transition) { state.transition = null; state.mode = 'orbit'; }
// The map flight is another consumer of the same camera path, with a distinct 1.3 s duration.
const anchor = mapAnchors[1];
teleportTo(anchor);
const mapFlight = state.transition, mapStart = clockStart(mapFlight);
for (let f = 1; f <= 7 && state.transition; f++) updateCamera(.05, mapStart + 200 * f);
const teleportError = anchor ? state.direction.distanceTo(anchor.direction) * R : Infinity;
ok('map teleport uses the same wall clock and arrives at its actual anchor',
  !!anchor && mapFlight.duration === 1.3 && !state.transition && teleportError < 1e-6,
  'anchor error ' + mm(teleportError));

if (state.transition) { state.transition = null; state.mode = 'ground'; }
switchMode();
const resumed = state.transition, resumeStart = clockStart(resumed);
updateCamera(.05, resumeStart + 500);
const beforePause = resumed.time;
if (rebaseFrameClock) rebaseFrameClock(); // the visibility/context handlers call this on resume
const afterResumeClock = clockStart(resumed);
updateCamera(1 / 60, afterResumeClock + 1000 / 60);
ok('rebasing after a hidden tab or restored context does not advance the flight by the absent time',
  !!rebaseFrameClock && Math.abs(resumed.time - beforePause - 1 / 60) < 1e-6,
  'before ' + beforePause.toFixed(3) + ' s; after ' + resumed.time.toFixed(3) + ' s');

// Manual frame stepping remains useful to the existing offline landing tests; no real clock is supplied.
state.transition = null; state.mode = 'orbit';
switchMode();
const manual = state.transition;
let manualFrames = 0;
while (state.transition && manualFrames < 120) { updateCamera(1 / 60); manualFrames++; }
ok('manual headless stepping remains deterministic', !state.transition && manualFrames >= 108 && manualFrames <= 109,
  manualFrames + ' frames for ' + manual.duration + ' s');

const reduced = await buildWorld({ reducedMotion: true });
reduced.switchMode();
const shortFlight = reduced.state.transition, shortStart = clockStart(shortFlight);
for (let f = 1; f <= 30 && reduced.state.transition; f++) reduced.updateCamera(1 / 60, shortStart + f * 1000 / 60);
ok('reduced motion still uses the shorter 0.45 second flight', shortFlight.duration === .45 && !reduced.state.transition,
  'configured ' + shortFlight.duration + ' s');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
