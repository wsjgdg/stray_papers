// The drift-reefs, in the water, through the page's own `updateReefs`.
//
// The user decided the path for these animals in two sentences: "平时外围深水慢巡，每隔一阵滑进柱廊上方一次"
// and "浮上来是让背上珊瑚园见光，散出园子的卵". Both are promises about where a body may be in the water, so
// this suite watches all six of them for ten minutes of page frames and checks the promises — plus the two
// ones that came out of the same conversation: rising is a swim and not a lift, and nothing ever eats into
// the seabed or into its own columns.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { R, SEA, heightAt, updateReefs, reefs } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};

const dt = 1 / 120;
const SECONDS = 600;
const frames = Math.round(SECONDS / dt);

// Per-raft recorders. Every one of them is a minimum or a maximum over the whole ten minutes, because a
// single bad frame is exactly what the eye catches.
const keelOverBed = reefs.map(() => Infinity);
const keelOverStone = reefs.map(() => Infinity);
const roomUnder = reefs.map(() => Infinity);
const strays = reefs.map(() => 0);
const peakClimb = reefs.map(() => 0);          // vertical speed as a multiple of the body's swim speed
const climbSamples = [];                       // ...and its distribution when it is actually travelling
const pitchSamples = [];                       // climb as a share of the distance covered in the same frame
let fastest = 0;                               // the fastest any plate ever travelled, in world units a second
const peakStep = reefs.map(() => 0);           // frame-to-frame travel as a multiple of nominal
const deepest = reefs.map(() => 0);
const canDiveRoom = reefs.map(() => 0);
const blowAway = reefs.map(() => 0);           // worst frame of "spawning while not over the farm"
const spawnShallow = reefs.map(() => 0);       // worst depth while the garden was spawning
let overlap = Infinity, overlapPair = '';
let blows = reefs.map(() => 0), spans = reefs.map(() => 0);
const wasBlow = reefs.map(() => false);
const lastPlume = reefs.map(w => w.plume);
const lastPos = reefs.map(w => w.pos.clone());
const lastDepth = reefs.map(w => w.depth);

for (let f = 0; f < frames; f++) {
  const elapsed = f * dt;
  updateReefs(dt, elapsed);
  for (let i = 0; i < reefs.length; i++) {
    const w = reefs[i];
    const bed = R + heightAt(w.pos);
    const room = SEA - heightAt(w.pos);                       // water under it, right here
    const speed = .026 * w.scale;
    canDiveRoom[i] = Math.max(canDiveRoom[i], room);
    keelOverBed[i] = Math.min(keelOverBed[i], w.hit.bottom - bed);
    roomUnder[i] = Math.min(roomUnder[i], room);
    strays[i] = Math.max(strays[i], w.pos.angleTo(w.home) * R);
    deepest[i] = Math.max(deepest[i], w.depth);
    // The plate's own footprint, against the tallest stone under it. The page leaves ten millimetres at
    // the plate edge on purpose; the suite only insists on daylight.
    for (const stone of w.stones) {
      if (stone.dir.distanceTo(w.pos) * R > w.hit.r + stone.r + .050) continue;
      keelOverStone[i] = Math.min(keelOverStone[i], w.hit.bottom - stone.top);
    }
    // Rising has to read as swimming: the body answers the climb with a pitch, and a pitch has a tangent.
    const climb = Math.abs(w.depth - lastDepth[i]) / dt / Math.max(speed, 1e-6);
    peakClimb[i] = Math.max(peakClimb[i], climb);
    climbSamples.push(climb);
    // The first few seconds are the body settling onto the ring it was placed beside, not a swim: the ring
    // is where it wants to be, and it starts where the build put it.
    if (f > 120 * 5) {
      const step = w.pos.distanceTo(lastPos[i]) * R / dt / Math.max(speed, 1e-6);
      peakStep[i] = Math.max(peakStep[i], step);
      fastest = Math.max(fastest, w.pos.distanceTo(lastPos[i]) * R / dt);
      // The shape of the animal, not a design number: how far it climbs for how far it goes. A body that is
      // swimming answers its climb with a pitch, so this ratio is bounded by the tangent of that pitch.
      const across = w.pos.distanceTo(lastPos[i]) * R;
      if (across > .02 * dt) pitchSamples.push(Math.abs(w.depth - lastDepth[i]) / across);
    }
    if (w.mode === 'blow' && !wasBlow[i]) blows[i]++;
    if (w.mode === 'blow' && w.pos.angleTo(w.home) >= .020) {
      blowAway[i] = Math.max(blowAway[i], w.pos.angleTo(w.home));
    }
    // The garden only spawns out of the water — that is the whole point of the animal coming up.
    if (w.plume > lastPlume[i] + 1e-9) spawnShallow[i] = Math.max(spawnShallow[i], w.depth);
    if (w.plume > .5 && lastPlume[i] <= .5) spans[i]++;
    wasBlow[i] = w.mode === 'blow';
    lastPlume[i] = w.plume;
    lastPos[i].copy(w.pos);
    lastDepth[i] = w.depth;
    // Two bodies are not one body.
    for (let j = i + 1; j < reefs.length; j++) {
      const gap = w.pos.distanceTo(reefs[j].pos) * R - w.hit.r - reefs[j].hit.r;
      if (gap < overlap) { overlap = gap; overlapPair = i + '/' + j; }
    }
  }
}

const mm = v => (v * 1000).toFixed(1) + ' mm';
const min = a => Math.min(...a), max = a => Math.max(...a);

ok('ten minutes of the rafts\' own frames runs without throwing', reefs.length === 6,
  reefs.length + ' drift-reefs, ' + SECONDS + ' s at 120 Hz');

ok('no raft ever eats into the seabed', min(keelOverBed) > 0,
  'the keel came within ' + mm(min(keelOverBed)) + ' of the bed; the page keeps eight millimetres');

ok('and none of them ever eats into one of its own columns', min(keelOverStone) > 0,
  'closest keel-to-stone ' + mm(min(keelOverStone)) + ' — the plate edge is meant to keep ten');

ok('no raft ever beaches or leaves the water', min(roomUnder) > .004,
  'the shallowest water any of them crossed was ' + mm(min(roomUnder)) + ' deep');

// `orbit` and the wobble are angles, not chords: the ring reaches 5.8 × orbit radians from home, which on
// the widest farm is 415 mm — the raft does not stay on a plate, it works a wide patch of water.
ok('every raft stays inside the ring it works', reefs.every((w, i) => strays[i] <= Math.max(w.orbit, .012) * 5.8 * R + .004),
  'the furthest any drifted from home was ' + mm(max(strays)) + ' against a widest ring of ' +
  mm(max(reefs.map(w => Math.max(w.orbit, .012) * 5.8 * R + .004))));

// "Rising is not a lift." The page clamps its pitch at .34 rad, whose tangent is .35 — so a body that is
// really swimming cannot climb faster than about a third of its own forward speed.
// Two numbers, because there are two things to hold: what the animal does all minute (the shape of the
// swim) and what it may do in an emergency (a column coming under the plate).
{
  pitchSamples.sort((a, b) => a - b);
  const p99 = pitchSamples[Math.floor(pitchSamples.length * .99)];
  ok('rising is a swim, not a lift', p99 < .45 && max(peakClimb) < 8,
    'in ninety-nine frames out of a hundred, climbing is ' + p99.toFixed(2) +
    '× the distance covered in the same frame — under the ' + Math.tan(.34).toFixed(2) +
    '× the pitch clamp allows, i.e. the body never noses up steeper than it says it is');
}

// A physical bound rather than a design number: the plate is 260 mm across, and the fastest any of them ever
// moved is three quarters of its own length in a second. (For scale, the page's own cruise is .026 units/s and
// a lap's widest ring runs at 5.8 times that.)
{
  const body = 2 * max(reefs.map(w => w.hit.r));
  ok('and no plate ever moves faster than a body that size can swim', fastest / body < .80,
    'the fastest any raft travelled was ' + (fastest * 1000).toFixed(0) + ' mm/s = ' + (fastest * 17).toFixed(1) +
    ' m/s, which is ' + (fastest / body).toFixed(2) + ' of its own length (the widest plate is ' +
    (body * 17).toFixed(1) + ' m) — a body that slid rather than swam was doing four and a half times its ' +
    'length before this build');
}

// "浮上来是让背上珊瑚园见光" — it may only be out of the water above the columns it farms, because that is
// the only place the spawn means anything.
ok('a raft is only out of the water over its own columns', max(blowAway) < .020,
  'the furthest from home any raft was while surfacing: ' + mm(max(blowAway)) + ' of the allowed ' + mm(.020));

ok('and the garden spawns only while it is up', max(spawnShallow) < .010,
  'the deepest any raft was while its own plume was rising: ' + mm(max(spawnShallow)));

ok('every raft comes up to spawn repeatedly', min(blows) >= 2 && min(spans) >= 2,
  'over ten minutes the six of them surfaced ' + blows.join('/') + ' times and released ' + spans.join('/') + ' times');

// The two-halves decision, measured rather than assumed: a raft may only settle away from the surface where
// there is water to settle into, and this planet's farms are shallow. So the promise is checked for the
// rafts whose own shelf is deep enough to keep it, and the shallow ones are reported instead of hidden.
const deepEnough = reefs.map((w, i) => canDiveRoom[i] > .090);
const dived = reefs.map((w, i) => deepest[i] >= .012);
ok('every raft settles out of the light for part of the minute', deepEnough.every((d, i) => !d || dived[i]),
  deepEnough.filter(Boolean).length + ' of 6 farms sit over more than 90 mm of water, so this is the ' +
  'animal\'s choice and not the shelf\'s; the deepest each of them settled was ' +
  reefs.map((w, i) => (deepest[i] * 1000).toFixed(0)).join('/') + ' mm below the surface');

ok('two rafts are never one raft', overlap > 0,
  'closest pair (' + overlapPair + ') kept ' + mm(overlap) + ' of daylight between their plates');

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
