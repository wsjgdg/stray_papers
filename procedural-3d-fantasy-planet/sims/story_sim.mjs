// Exercises the page's real state machines and localStorage, not a separate rules implementation.
// No GPU or human sight/sound acceptance is implied; browser/story.mjs covers real DOM/WebGL wiring.
import { buildWorld } from './world.mjs';

const w = await buildWorld();
const { THREE, R, SEA, WATER, EYE, SWIM_EYE, SWIM_SPEED, state, keys, landing, nearDirection, heightAt,
  landmarks, story, storyStage, decodeStory, recordDetune, resetStory, STORY_KEY, storyMarkDirection,
  inquest, updateInquest, clearInquest, patrol, patrolWorld, shelterRings, inquestSheltered,
  INQUEST_WARNING, INQUEST_SWEEP, INQUEST_SHELTER, drowned, updateDrowned, shadow, trenchDirection,
  echoes, echoSites, updateEchoes, eventState, triggerEvent, finishEvent, costState, storage } = w;
let pass = 0, fail = 0;
const ok = (label, condition, info = '') => {
  if (condition) { pass++; console.log('  PASS ' + label + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + label + (info ? ' — ' + info : '')); }
};
const stepInquest = seconds => { for (let i = 0; i < Math.round(seconds * 10); i++) updateInquest(.1, true); };
const freshGround = dir => {
  state.mode = 'ground'; state.transition = null; state.direction.copy(dir); state.radius = R + Math.max(SEA, heightAt(dir)) + EYE;
  state.grounded = true; state.water = false; state.submerged = false; state.depth = 0; state.swimBlend = 0;
  state.speed = 0; state.moveVelocity.set(0, 0, 0); keys.clear(); clearInquest();
};

ok('a fresh device begins with no signal, mark or visible story geometry',
  story.detunes === 0 && story.detections === 0 && story.mark === null && storyStage() === 0 && !echoes.visible && !shadow.visible);
const cities = w.skyCities;
w.scene.updateMatrixWorld(true); w.camera.updateMatrixWorld(true);
let lowestCityPoint = Infinity;
for (const city of cities) {
  const positions = city.mesh.geometry.attributes.position, point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(city.mesh.matrixWorld);
    lowestCityPoint = Math.min(lowestCityPoint, point.length());
  }
}
ok('three distinct, bounded city silhouettes exist above both mirror bands',
  cities.map(c => c.id).join(',') === 'VIRE,SOLEN,KEST' && cities.every(c => c.group.parent === w.scene && c.group.visible &&
    c.mesh.geometry.attributes.position.count > 50 && Math.abs(c.direction.length() - 1) < 1e-6) && lowestCityPoint > 9.4 &&
  cities[0].radius > cities[1].radius && cities[1].radius > cities[2].radius,
  `lowest vertex radius=${lowestCityPoint.toFixed(3)}`);
const framed = cities.filter(c => {
  const p = c.group.position, screen = p.clone().project(w.camera), line = p.clone().sub(w.camera.position);
  const t = Math.max(0, Math.min(1, -w.camera.position.dot(line) / line.lengthSq()));
  const clearance = w.camera.position.clone().addScaledVector(line, t).length();
  return Math.abs(screen.x) < .98 && Math.abs(screen.y) < .98 && screen.z < 1 && clearance > 5.3;
}).length;
ok('the initial orbit frames the three physical city directions above the planet', framed === 3, `${framed}/3 in desktop frame`);
let ringMin = Infinity, ringMax = -Infinity, ringRadiusError = 0;
const ringPoint = new THREE.Vector3(), ringDir = new THREE.Vector3();
for (let k = 0; k < shelterRings.children.length; k++) {
  const positions = shelterRings.children[k].geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 5) {
    ringPoint.fromBufferAttribute(positions, i); ringDir.copy(ringPoint).normalize();
    const clearance = ringPoint.length() - R - Math.max(SEA, heightAt(ringDir));
    ringMin = Math.min(ringMin, clearance); ringMax = Math.max(ringMax, clearance);
    ringRadiusError = Math.max(ringRadiusError, Math.abs(ringDir.distanceTo(landmarks[k].direction) * R - INQUEST_SHELTER));
  }
}
ok('all nine shelter outlines follow actual sloping terrain and the protection boundary',
  shelterRings.children.length === landmarks.length && ringMin > 0 && ringMax < .04 && ringRadiusError < .004,
  `ground clearance ${ringMin.toFixed(4)}..${ringMax.toFixed(4)}, radius error ${ringRadiusError.toFixed(4)}`);
triggerEvent('ley'); eventState.time = 2.3; w.detune.next = 0; w.updateEvents(.01, 0);
ok('an actual operation records its automatic wrong note and halves its pending bill',
  story.detunes === 1 && JSON.parse(storage.getItem(STORY_KEY)).detunes === 1 && costState.pending === .5);
finishEvent(); resetStory(); w.detune.count = 0; w.detune.notes = 0;
ok('untrusted saves are rejected rather than used as world positions',
  decodeStory('{') === null && decodeStory(JSON.stringify({ version: 99, detunes: 1, detections: 0, mark: null })) === null &&
  decodeStory(JSON.stringify({ version: 1, detunes: -1, detections: 0, mark: null })) === null &&
  decodeStory(JSON.stringify({ version: 1, detunes: 3, detections: 3, mark: [0, 0, 0] })) === null &&
  decodeStory(JSON.stringify({ version: 1, detunes: 3, detections: 3, mark: null })) === null);
const valid = decodeStory(JSON.stringify({ version: 1, detunes: 5, detections: 3, mark: [1.01, 0, 0] }));
ok('valid saved coordinates are normalized before drawing or measuring', valid?.mark[0] === 1 && valid.mark.length === 3);

for (let i = 0; i < 19; i++) recordDetune();
ok('each real wrong note is saved without unlocking the sea early', story.detunes === 19 && storyStage() === 0 &&
  JSON.parse(storage.getItem(STORY_KEY)).detunes === 19 && w.getDiagnostics().detune === 19);
recordDetune(); updateEchoes();
ok('the twentieth note unlocks anchored schools in both hemispheres', storyStage() === 1 && echoes.visible &&
  echoSites.length > 30 && echoSites.some(s => s.dir.y > .4) && echoSites.some(s => s.dir.y < -.4) &&
  echoSites.every(s => heightAt(s.dir) < SEA - .10), echoSites.length + ' deep-water schools');
const nightIndex = echoSites.findIndex(s => s.dir.dot(w.sun) < -.3);
const beforeEcho = new THREE.Matrix4(), afterEcho = new THREE.Matrix4();
echoes.getMatrixAt(nightIndex, beforeEcho); w.advanceFrame(.5); echoes.getMatrixAt(nightIndex, afterEcho);
ok('a night school moves in world space instead of following the camera', nightIndex >= 0 &&
  Math.hypot(beforeEcho.elements[12] - afterEcho.elements[12], beforeEcho.elements[13] - afterEcho.elements[13],
    beforeEcho.elements[14] - afterEcho.elements[14]) > .0001);

// A tiny Web Audio recorder checks the actual mix control, not an audible/hardware judgement.
class Param { constructor() { this.value = 0; this.last = null; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; }
  exponentialRampToValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.last = v; } }
class AudioNode { constructor() { this.gain = new Param(); this.frequency = new Param(); this.Q = new Param(); this.detune = new Param(); }
  connect(next) { return next; } start() {} stop() {} }
class AudioRecorder { constructor() { this.state = 'running'; this.sampleRate = 8000; this.currentTime = 1; this.destination = new AudioNode(); }
  createGain() { return new AudioNode(); } createBiquadFilter() { return new AudioNode(); } createOscillator() { return new AudioNode(); }
  createBufferSource() { return new AudioNode(); } createBuffer(_c, length) { return { getChannelData: () => new Float32Array(length) }; } resume() {} }
w.setAudioContext(AudioRecorder); w.toggleSound();
const audio = w.getAudio();
for (let i = story.detunes; i < 50; i++) recordDetune();
freshGround(trenchDirection); w.updateAudioMix(0, true);
const nearGain = audio.drownedGain.gain.last;
state.direction.copy(trenchDirection).negate(); w.updateAudioMix(0, true);
const farGain = audio.drownedGain.gain.last;
ok('at fifty notes the trench pulse is present nearby and fades away across the globe',
  storyStage() === 2 && nearGain > 0 && farGain === 0, `near=${nearGain}, far=${farGain}`);
w.advanceFrame(.25);
ok('the same stage disturbs the real sanctuary halo rhythm',
  landmarks.some(l => Math.abs(l.halo.rotation.y - w.elapsed * .13) > .01));
w.toggleSound();
const offGain = audio.drownedGain.gain.last; w.updateAudioMix(0, true);
ok('muted sound never schedules a new Drowned pulse', audio.drownedGain.gain.last === offGain);

for (let i = story.detunes; i < 99; i++) recordDetune();
freshGround(trenchDirection); triggerEvent('veil'); eventState.time = 6;
w.updateSkyCities();
ok('city geometry remains in the real scene on the ground as well as in orbit',
  cities.every(c => c.group.parent === w.scene && c.group.visible));
updateDrowned(.1, true);
ok('a veil before the hundredth note cannot reveal the Drowned', storyStage() === 2 && !shadow.visible);
recordDetune(); updateDrowned(.1, true);
ok('the hundredth note raises the physical shadow at the actual trench during a veil',
  storyStage() === 3 && shadow.visible && drowned.active && drowned.direction.distanceTo(trenchDirection) < 1e-5);
ok('contact with the shadow has a bounded, non-lethal consequence', drowned.contacts === 1 && drowned.slow > 0 && drowned.cooldown > 0);
updateDrowned(.1, true);
ok('one encounter cannot register another hit every frame', drowned.contacts === 1);
finishEvent(); updateDrowned(.1, true);
ok('the shadow disappears when the veil ends', !shadow.visible && !drowned.active);

// Verify the slowdown goes through the actual swimming physics, not just a status flag. In deep
// water the normal controller keeps momentum while airborne, so this also guards the swim path.
freshGround(trenchDirection); state.radius = WATER + SWIM_EYE; state.water = true; state.swimBlend = 1; state.grounded = false;
state.heading.crossVectors(state.direction, new THREE.Vector3(1, 0, 0)).normalize();
state.moveVelocity.copy(state.heading).multiplyScalar(SWIM_SPEED); drowned.slow = 3; keys.add('KeyW');
for (let i = 0; i < 60; i++) w.physicsStep(1 / 60);
const slowed = state.speed; drowned.slow = 0;
for (let i = 0; i < 60; i++) w.physicsStep(1 / 60);
const recovered = state.speed; keys.clear();
ok('shadow contact really slows a swimmer and normal motion returns', slowed < .14 && recovered > .18,
  `slowed=${slowed.toFixed(3)}, recovered=${recovered.toFixed(3)}`);

// Locate a dry place that is not inside any sanctuary cover. No test moves or hides world objects.
resetStory();
let exposed = null;
for (let i = 0; i < 200 && !exposed; i++) {
  const dir = nearDirection(landing, i * 2.4, (.35 + (i % 8) * .04) / R);
  if (heightAt(dir) > SEA + .02 && landmarks.every(l => l.direction.distanceTo(dir) * R > INQUEST_SHELTER + .04)) exposed = dir;
}
ok('fixture is exposed dry terrain outside all sanctuary shelters', !!exposed);
if (!exposed) { console.log('\n' + pass + ' PASS / ' + (fail + 1) + ' FAIL'); process.exit(1); }
freshGround(exposed); eventState.next = 1e9;
stepInquest(95);
ok('staying in one place without witnessing an operation never starts a scan', inquest.phase === 'idle' && !inquest.witnessed && story.detections === 0);
triggerEvent('ley'); updateInquest(.1, true);
ok('a witnessed operation and sufficient local dwell start a visible, warned scan',
  inquest.phase === 'warning' && patrol.visible && shelterRings.visible && inquest.time === 0);
const warnCenter = patrolWorld.clone(); stepInquest(INQUEST_WARNING - .1);
ok('the warning lasts its full advertised interval before a sweep', inquest.phase === 'warning');
stepInquest(.2);
ok('the patrol has a real body and the scanning phase starts after the warning',
  inquest.phase === 'sweep' && patrol.visible && patrolWorld.length() > R && warnCenter.length() > R);
stepInquest(INQUEST_SWEEP + 2);
ok('a stationary unprotected player is scanned at most once per pass', story.detections === 1 && inquest.sweeps === 1,
  `detections=${story.detections}, sweeps=${inquest.sweeps}`);
for (let i = 0; i < 800 && story.detections < 3; i++) updateInquest(.1, true);
ok('three separate scans record a real location without killing or relocating the player', story.detections === 3 &&
  story.mark && storyMarkDirection.distanceTo(exposed) < 1e-7 && state.direction.distanceTo(exposed) < 1e-7 &&
  state.mode === 'ground' && JSON.parse(storage.getItem(STORY_KEY)).detections === 3);
const markedLocation = storyMarkDirection.clone();
clearInquest(); triggerEvent('migration'); updateInquest(.1, true);
ok('after being recorded, the next ground operation queues an extra scan immediately',
  inquest.phase === 'warning' && inquest.dwell < 1);
state.direction.copy(nearDirection(exposed, 0, .40 / R)); updateInquest(.1, true);
ok('leaving the local search area cancels the scan instead of producing a phantom hit',
  inquest.phase === 'idle' && story.detections === 3 && !patrol.visible);

// A reading overlay may continue the world, but cannot inflict a hit while it owns input.
freshGround(exposed); w.setArchive(true); triggerEvent('starfall'); updateInquest(.1, true);
ok('an operation while reading queues a scan without counting down or hitting',
  inquest.phase === 'idle' && inquest.queued === 1 && story.detections === 3);
triggerEvent('bloom'); updateInquest(.1, true);
ok('distinct operations while reading each retain an extra scan', inquest.queued === 2);
w.setArchive(false); updateInquest(.1, true);
ok('the queued scan warns once the player closes the archive', inquest.phase === 'warning' && inquest.queued === 1);
w.setArchive(true); const pausedAt = inquest.time; stepInquest(10);
ok('an already active scan waits while a player is reading', inquest.time === pausedAt && story.detections === 3);
w.setArchive(false);

// Reload before resetting: both the original mark and the wrong-note progress are real storage.
// Add one wrong note after reset above so the two fields can be distinguished.
recordDetune();
const w2 = await buildWorld();
ok('a newly built world restores the exact mark and accumulated notes', w2.story.detunes === 1 &&
  w2.story.detections === 3 && w2.storyMarkDirection.distanceTo(markedLocation) < 1e-7 && w2.getStoryStorage() === 'available');

// Defence cases each run a full real sweep. Starting a new operation with no mark is not an immediate scan.
resetStory(); finishEvent(); freshGround(landmarks[0].direction); triggerEvent('ley'); stepInquest(130);
ok('a sanctuary protection ring actually prevents the searchlight from recording a player',
  inquestSheltered() && story.detections === 0 && inquest.sweeps > 0);
resetStory(); finishEvent(); freshGround(exposed); state.submerged = true; triggerEvent('ley'); stepInquest(130);
ok('being submerged prevents a searchlight hit', inquestSheltered() && story.detections === 0 && inquest.sweeps > 0);
resetStory(); finishEvent(); freshGround(exposed); state.speed = .10; triggerEvent('bloom'); stepInquest(130);
ok('moving during Bloom Tide prevents a searchlight hit', inquestSheltered() && story.detections === 0 && inquest.sweeps > 0);
state.speed = 0; stepInquest(50);
ok('standing still during Bloom Tide is not an invisibility cheat', !inquestSheltered() && story.detections > 0);

const paidBefore = costState.paid, sessionBefore = w.getDiagnostics().detune;
resetStory();
ok('reset clears only story progress, marks, threats and the stored key', story.detunes === 0 && story.detections === 0 &&
  story.mark === null && inquest.phase === 'idle' && !patrol.visible && !shadow.visible && !echoes.visible &&
  storage.getItem(STORY_KEY) === null && costState.paid === paidBefore && w.getDiagnostics().detune === sessionBefore);
const w3 = await buildWorld();
ok('a refresh after reset stays reset', w3.story.detunes === 0 && w3.story.detections === 0 && !w3.story.mark);

storage.setItem(STORY_KEY, '{bad json');
const bad = await buildWorld();
ok('a corrupt saved record does not break startup and is reported honestly', bad.getStoryStorage() === 'corrupt' && bad.story.detunes === 0);
bad.recordDetune();
ok('the next successful save repairs a corrupt record', bad.getStoryStorage() === 'available' && JSON.parse(storage.getItem(STORY_KEY)).detunes === 1);
const original = { getItem: storage.getItem, setItem: storage.setItem, removeItem: storage.removeItem };
storage.getItem = storage.setItem = storage.removeItem = () => { throw new Error('storage denied'); };
try {
  const blocked = await buildWorld(); blocked.recordDetune();
  ok('denied storage keeps the world playable and reports session-only progress', blocked.story.detunes === 1 && blocked.getStoryStorage() === 'unavailable');
  blocked.resetStory();
  ok('a denied reset clears the session but does not falsely report that storage was erased', blocked.story.detunes === 0 && blocked.getStoryStorage() === 'unavailable');
} finally { Object.assign(storage, original); storage.removeItem(STORY_KEY); }

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
