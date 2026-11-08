// Exercise whole frame order, not isolated helpers: surface input drives real physics, then the page's
// updateWorld decides whether to discover fauna, start footfall/bump audio, and light a nearby mirror node.
// A recorder substitutes for the Web Audio device here; the separate browser smoke uses actual Web Audio.
import { buildWorld } from './world.mjs';

class AudioParamRecorder {
  constructor() { this.value = 0; this.first = null; }
  setValueAtTime(value) { this.first ??= value; this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
}
class AudioNodeRecorder {
  constructor(ctx, kind) {
    this.ctx = ctx; this.kind = kind;
    this.gain = new AudioParamRecorder(); this.frequency = new AudioParamRecorder();
    this.Q = new AudioParamRecorder(); this.detune = new AudioParamRecorder();
  }
  connect(next) { return next; }
  start() { this.ctx.starts.push({ kind: this.kind, frequency: this.frequency.first }); }
  stop() {}
}
class AudioContextRecorder {
  constructor() {
    this.state = 'running'; this.sampleRate = 48000; this.currentTime = 1;
    this.destination = new AudioNodeRecorder(this, 'destination'); this.starts = [];
  }
  createGain() { return new AudioNodeRecorder(this, 'gain'); }
  createBiquadFilter() { return new AudioNodeRecorder(this, 'filter'); }
  createOscillator() { return new AudioNodeRecorder(this, 'oscillator'); }
  createBufferSource() { return new AudioNodeRecorder(this, 'buffer'); }
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  resume() {}
}

const w = await buildWorld();
const { THREE, R, EYE, state, camera, keys, landing, heightAt, overlapAt, walkBoxes, settlementDirs,
  CODEX, codexScan, codexHTML, inSight, flockWorld, archiveChip, modeLabel, setArchive, provinceAt,
  updateWorld, advanceFrame, latticeRings, updateLattice, eventFx, triggerEvent, sun, weather,
  resetGroundMotion, bell, reefs } = w;
let pass = 0, fail = 0;
const ok = (name, condition, info = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const dt = 1 / 60;

// Nothing is discovered from orbit or halfway through a descent, regardless of the timer.
for (let i = 0; i < 40; i++) advanceFrame(dt);
ok('orbit frames do not discover creatures or provincial swarms', CODEX.every(e => !e.seen),
  CODEX.filter(e => e.seen).length + ' entries seen');
state.mode = 'ground'; state.transition = {};
for (let i = 0; i < 36; i++) updateWorld(dt);
ok('descent frames do not discover creatures before landing', CODEX.every(e => !e.seen),
  CODEX.filter(e => e.seen).length + ' entries seen while transitioning');

w.setAudioContext(AudioContextRecorder); w.toggleSound();
const audio = w.getAudio();
ok('the page can enable its sound graph', !!audio && audio.ctx.state === 'running',
  audio ? 'background nodes started: ' + audio.ctx.starts.length : 'no audio graph');
if (!audio) { console.log('\n' + pass + ' PASS / ' + fail + ' FAIL'); process.exit(1); }
audio.ctx.starts.length = 0;

const site = settlementDirs.find(s => s.welcome);
state.mode = 'ground'; state.transition = null; state.direction.copy(landing);
state.radius = R + heightAt(landing) + EYE; state.velocity = 0; state.grounded = true;
state.water = false; state.swimBlend = 0; state.depth = 0; state.crouch = 0; state.ghost = false;
state.heading.copy(site.dir).addScaledVector(state.direction, -site.dir.dot(state.direction)).normalize();
state.pitch = .13; resetGroundMotion();
keys.add('KeyW');
for (let i = 0; i < 90; i++) advanceFrame(dt);
keys.clear();
const footsteps = audio.ctx.starts.filter(e => e.kind === 'oscillator' && [54, 58, 66, 92, 180].includes(e.frequency)).length;
const localSwarm = CODEX.find(e => e.province === provinceAt(state.direction));
ok('real walking consumes physics footfalls in updateWorld and starts their sound nodes',
  state.footfalls >= 1 && state.lastFootfall === state.footfalls && footsteps === state.footfalls,
  state.footfalls + ' physics steps, ' + state.lastFootfall + ' consumed, ' + footsteps + ' footstep oscillators');
ok('surface frames discover the swarm of the province underfoot', !!localSwarm?.seen && localSwarm.fresh && archiveChip.classList.contains('has-news'),
  (localSwarm?.id || 'no provincial entry') + ', seen=' + !!localSwarm?.seen + ', fresh=' + !!localSwarm?.fresh);
ok('the archive reveals a found entry but still withholds unseen entries',
  codexHTML().includes(localSwarm?.name || 'NO_ENTRY') && codexHTML().includes('is-unseen'));
// Pick two frames away from the 12-frame housekeeping interval, so the test cannot accidentally
// pass because the slow HUD refresh happened to coincide with the key press or release.
while ((w.frame + 1) % 12 === 0 || (w.frame + 2) % 12 === 0) advanceFrame(dt);
keys.add('KeyH'); advanceFrame(dt);
const phasingLabel = state.ghost && modeLabel.textContent.includes('PHASING');
keys.delete('KeyH'); advanceFrame(dt);
ok('the H phasing label follows press and release on the very next frame',
  phasingLabel && !state.ghost && !modeLabel.textContent.includes('PHASING'),
  'pressed=' + phasingLabel + ', released label=' + modeLabel.textContent);
setArchive(true);
ok('opening the archive clears the notification and spends the new marks',
  !archiveChip.classList.contains('has-news') && CODEX.every(e => !e.fresh));
// Move the fixture to another real province while the panel is open. updateWorld, not a direct scan,
// must add the new row to the already-open panel.
const otherSite = settlementDirs.find(s => provinceAt(s.dir) !== localSwarm?.province);
const otherSwarm = otherSite && CODEX.find(e => e.province === provinceAt(otherSite.dir));
if (otherSite) {
  state.direction.copy(otherSite.dir); state.radius = R + heightAt(otherSite.dir) + EYE;
  for (let i = 0; i < 36; i++) updateWorld(dt);
}
ok('the open archive refreshes when a new provincial swarm is discovered',
  !!otherSwarm?.seen && otherSwarm.fresh && w.getCodexHTML().includes(otherSwarm.name) &&
    archiveChip.classList.contains('has-news'),
  (otherSwarm?.id || 'no other province') + ', seen=' + !!otherSwarm?.seen);
setArchive(false);

// Approach real first-town buildings from every clean face. Require the physics collision and its
// 104 Hz sound node: calling bumpCall directly would not exercise the frame gate or the face sign.
function runIntoWall(axisName, sign, frameDt) {
  let approach = null;
  for (const box of walkBoxes.filter(b => b.source?.site === site && b.layer === 'house')) {
    const axis = box[axisName], half = axisName === 'ex' ? box.hx : box.hz;
    const start = box.dir.clone().addScaledVector(axis, sign * (half + .035) / R).normalize();
    const feet = R + heightAt(start);
    if (box.bottom <= feet + .020 && box.top > feet && overlapAt(start, feet) <= 0) {
      approach = { axis, start, feet }; break;
    }
  }
  if (!approach) return { axisName, sign, frameDt, maxBump: 0, sounds: 0, missing: true };
  const { axis, start, feet } = approach;
  state.direction.copy(start); state.radius = feet + EYE;
  state.heading.copy(axis).multiplyScalar(-sign);
  state.heading.addScaledVector(start, -state.heading.dot(start)).normalize();
  state.velocity = 0; state.grounded = true; state.water = false; state.swimBlend = 0;
  state.depth = 0; state.crouch = 0; state.ghost = false; resetGroundMotion();
  state.footstepsAt = -9; audio.ctx.starts.length = 0;
  let maxBump = 0;
  keys.add('KeyW');
  for (let i = 0; i < Math.ceil(1 / frameDt); i++) {
    advanceFrame(frameDt); maxBump = Math.max(maxBump, state.bump);
  }
  keys.clear();
  const sounds = audio.ctx.starts.filter(e => e.kind === 'oscillator' && e.frequency === 104).length;
  return { axisName, sign, frameDt, maxBump, sounds, missing: false };
}
const faces = ['ex', 'ez'].flatMap(axis => [-1, 1].map(sign => runIntoWall(axis, sign, dt)));
const described = samples => samples.map(s => s.axisName + (s.sign < 0 ? '-' : '+') + '@' +
  Math.round(1 / s.frameDt) + ': impact ' + s.maxBump.toFixed(3) + ', sounds ' + s.sounds).join(' · ');
const hit = sample => !sample.missing && sample.maxBump > .05 && sample.sounds > 0;
ok('all four faces of real houses produce a collision sound', faces.every(hit), described(faces));
const rates = [1 / 30, 1 / 120].map(frameDt => runIntoWall('ex', -1, frameDt));
ok('the same impact survives 30 Hz and 120 Hz render frames', rates.every(hit), described(rates));

// Muted means truly silent for a newly crossed footfall, but the state must still consume it so that
// enabling sound later does not replay an old step.
w.toggleSound(); audio.ctx.starts.length = 0;
state.mode = 'ground'; state.transition = null; state.speed = .2; state.water = false;
state.footfalls++; updateWorld(dt);
ok('muted footsteps are consumed without starting a delayed sound',
  state.lastFootfall === state.footfalls && audio.ctx.starts.length === 0,
  'footfalls ' + state.footfalls + ', consumed ' + state.lastFootfall + ', sources ' + audio.ctx.starts.length);
state.mode = 'orbit'; state.footfalls++;
const priorStep = state.lastFootfall; updateWorld(dt);
ok('orbit does not consume or play a ground footfall', state.lastFootfall === priorStep && audio.ctx.starts.length === 0);

// A visibility cone is eye-to-actual-world-target, not radial direction dot camera forward. The
// ground-distance threshold is the unit-sphere chord times R, as elsewhere in collision/placement.
const eye = new THREE.Vector3(0, 1, 0), east = new THREE.Vector3(1, 0, 0);
camera.position.copy(eye).multiplyScalar(R + .10);
const target = (chord, height) => {
  const angle = 2 * Math.asin(chord / (2 * R));
  return eye.clone().multiplyScalar(Math.cos(angle)).addScaledVector(east, Math.sin(angle)).multiplyScalar(R + height);
};
const near = target(.20, .06), look = near.clone().sub(camera.position).normalize();
const cone41 = look.clone().applyAxisAngle(eye, 41 * Math.PI / 180);
const cone44 = look.clone().applyAxisAngle(eye, 44 * Math.PI / 180);
ok('a nearby target directly in front is seen; the same target behind is not',
  inSight(near, eye, look, .34) && !inSight(near, eye, look.clone().negate(), .34));
ok('the real eye-to-target view cone respects its 41°/44° boundary',
  inSight(near, eye, cone41, .34) && !inSight(near, eye, cone44, .34));
const within = target(.339, .06), outside = target(.341, .06);
ok('distance uses the actual surface chord at the 340 mm boundary',
  inSight(within, eye, within.clone().sub(camera.position).normalize(), .34) &&
  !inSight(outside, eye, outside.clone().sub(camera.position).normalize(), .34));
ok('an unplaced target at the origin cannot be discovered', !inSight(new THREE.Vector3(), eye, look, 1.15));
const high = target(.25, .50), upLook = high.clone().sub(camera.position).normalize();
ok('a high flying target requires looking up instead of flattening its altitude',
  inSight(high, eye, upLook, 1.15) && !inSight(high, eye, east, 1.15));

// Feed actual animal records and flock world positions through codexScan. The fixture repositions
// data only inside this test; it does not replace the real scene or the scan function.
const clearCodex = () => CODEX.forEach(e => { e.seen = false; e.fresh = false; });
const animal = bell[0], savedAnimal = { pos: animal.pos.clone(), world: animal.world.clone(), top: animal.hit.top };
const animalDir = target(.20, 0).normalize();
animal.pos.copy(animalDir); animal.world.copy(animalDir).multiplyScalar(R + .04); animal.hit.top = R + .08;
clearCodex(); codexScan(eye, target(.20, .06).sub(camera.position).normalize());
ok('the real codex scan can recognize a nearby bell when looking at its body', CODEX.find(e => e.id === 'bell').seen);
animal.pos.copy(savedAnimal.pos); animal.world.copy(savedAnimal.world); animal.hit.top = savedAnimal.top;
const raft = reefs[0], savedRaft = { pos: raft.pos.clone(), world: raft.world.clone() };
raft.pos.copy(animalDir); raft.world.copy(target(.20, .06));
clearCodex(); codexScan(eye, raft.world.clone().sub(camera.position).normalize());
ok('the real codex scan can recognize a nearby reef-rider', CODEX.find(e => e.id === 'reef').seen);
raft.pos.copy(savedRaft.pos); raft.world.copy(savedRaft.world);
const savedFlock = flockWorld.slice(); flockWorld.fill(0); high.toArray(flockWorld, 0);
clearCodex(); codexScan(eye, upLook);
const flockLookingUp = CODEX.find(e => e.id === 'flock').seen;
CODEX.find(e => e.id === 'flock').seen = false; codexScan(eye, east);
ok('the codex checks the flying animal at its world height', flockLookingUp && !CODEX.find(e => e.id === 'flock').seen,
  'up=' + flockLookingUp + ', level=' + CODEX.find(e => e.id === 'flock').seen);
flockWorld.set(savedFlock);

// Compare the actual rendered frame's panel colours with the page's own updateLattice using the
// same clock/light/operation: passing null instead of the surface normal must measurably differ.
state.mode = 'ground'; state.transition = null; state.direction.copy(landing);
state.radius = R + heightAt(landing) + EYE; state.velocity = 0; state.grounded = true; state.water = false;
// Pick the darkest solar angle at this real landing site so that the operation's added light is
// measured against a night sky, not almost completely washed out by daylight.
let darkest = Infinity, offset = 0;
for (let i = 0; i < 72; i++) {
  const candidate = i * Math.PI / 36, angle = -.72 + w.elapsed * Math.PI * 2 / 200 + candidate;
  const light = new THREE.Vector3(Math.sin(angle), .48, Math.cos(angle)).normalize().dot(landing);
  if (light < darkest) { darkest = light; offset = candidate; }
}
state.solarOffset = state.solarTarget = offset;
resetGroundMotion(); triggerEvent('ley');
for (let i = 0; i < 120; i++) advanceFrame(dt);
const colours = () => latticeRings.flatMap(r => Array.from(r.mesh.instanceColor.array));
const actual = colours();
const x = Math.max(0, Math.min(1, (state.direction.dot(sun) + .22) / .58));
const day = x * x * (3 - 2 * x);
updateLattice(w.elapsed, day, weather.now.cloud, state.direction, eventFx.glow);
const withEye = colours();
updateLattice(w.elapsed, day, weather.now.cloud, null, eventFx.glow);
const withoutEye = colours();
const delta = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const error = delta(actual, withEye), missingEffect = delta(withEye, withoutEye);
ok('the real surface frame lights the overhead mirror node during an operation',
  eventFx.glow > .05 && error < 1e-6 && missingEffect > .01,
  'operation ' + eventFx.glow.toFixed(3) + ', frame error ' + error.toFixed(4) + ', lost when eye omitted ' + missingEffect.toFixed(4));

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
