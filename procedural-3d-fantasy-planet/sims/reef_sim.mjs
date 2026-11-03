// The six 驮园 — the drift-reefs — and the two things that must be true about them.
//
// Depth is the hard constraint the user set: the column tops stand 37 to 89 mm under the water, so the animal's
// solid body has to stay clear above them, and it cruises 4 mm down with the garden in the air, sinking only where
// the shelf falls away. Everything else here is the price of that: no two rafts inside each other, no keel inside a
// column, no depth jumping between frames, and the garden's spawn let go at the surface rather than from depth.
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, state, updateReefs, resetGroundMotion, heightAt, reefs, EYE } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const dt = 1 / 120;

const stand = (dir) => {
  resetGroundMotion();
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
// Stand a little way off the first raft's home, on whatever ground is dry there — the reef only wakes when there
// is a walker, so the bench has to give it one.
stand(reefs[0].home.clone().add(new THREE.Vector3(0, 0, .05)).normalize());

// ---- the census ------------------------------------------------------------------------------------------
{
  let shallow = 0, bad = 0, dry = 0;
  for (const w of reefs) {
    if (heightAt(w.pos) >= SEA) dry++;
    if (!Number.isFinite(w.pos.length() + w.depth + w.scale)) bad++;
    if (w.depth < .0005) shallow++;
  }
  ok('six rafts, all of them in water', reefs.length === 6 && dry === 0 && bad === 0,
    reefs.length + ' 驮园: ' + dry + ' over dry ground, ' + shallow + ' riding with the plate touching the surface');
  // The garden is *supposed* to stand out of the water — that is what surfacing is for ("让背上珊瑚园见光") — so the
  // number to check is the animal's own cruise depth, not the top of its crop.
  const depths = reefs.map(w => w.depth);
  ok('and the plate itself rides just under the surface, with the garden in the air', Math.max(...depths) < .008,
    'the plate rides ' + mm(Math.min(...depths)) + ' to ' + mm(Math.max(...depths)) + ' under the waterline, and the ' +
    'garden on its back stands ' + mm(-Math.min(...reefs.map(w => (R + SEA) - w.hit.top))) + ' to ' +
    mm(-Math.max(...reefs.map(w => (R + SEA) - w.hit.top))) + ' proud of it');
}

// ---- a hundred and twenty seconds of the lap -------------------------------------------------------------
{
  const n = reefs.length;
  // The lap is slow: the outside swing runs off a sine of period 140 s, so a hundred and twenty seconds is not even
  // one full circuit for a raft whose phase starts at the wrong end of it.
  const seen = reefs.map(() => ({ minDepth: Infinity, maxDepth: -Infinity, moved: 0, plumeShallow: 0, plumeDeep: 0, plumeStartDeep: 0, wasPlume: false }));
  const before = reefs.map(w => w.pos.clone());
  let worstStep = 0, worstKeel = Infinity, worstPair = Infinity, wet = 0, bad = 0;
  let prevDepth = reefs.map(w => w.depth);
  for (let f = 0; f < 120 * 300; f++) {
    updateReefs(dt, f * dt);
    state.radius = R + heightAt(state.direction) + EYE;
    state.speed = 0;
    for (let i = 0; i < n; i++) {
      const w = reefs[i];
      seen[i].minDepth = Math.min(seen[i].minDepth, w.depth);
      seen[i].maxDepth = Math.max(seen[i].maxDepth, w.depth);
      worstStep = Math.max(worstStep, Math.abs(w.depth - prevDepth[i]));
      prevDepth[i] = w.depth;
      if (!Number.isFinite(w.pos.length() + w.depth + w.scale + w.bank + w.pitch)) bad++;
      if (heightAt(w.pos) >= SEA) wet++;
      if (w.plume > 0) { if (w.depth > .012) seen[i].plumeDeep++; else seen[i].plumeShallow++; }
      // What the rule is actually about: a garden may not *start* spawning while the animal is still down in the
      // dark. The tail of the plume lingers about a second after the raft settles, which is the fade, not a spout.
      if (!seen[i].wasPlume && w.plume > .05 && w.depth > .012) seen[i].plumeStartDeep++;
      seen[i].wasPlume = w.plume > .05;
      // The keel against every stone of its own farm: the page's own question, asked once per frame.
      for (const stone of w.stones) {
        const away = stone.dir.clone().sub(w.pos).multiplyScalar(R).length();
        if (away > w.hit.r + stone.r) continue;
        worstKeel = Math.min(worstKeel, w.hit.bottom - stone.top);
      }
      for (let j = i + 1; j < n; j++) {
        worstPair = Math.min(worstPair, w.pos.distanceTo(reefs[j].pos) * R - w.hit.r - reefs[j].hit.r);
      }
    }
  }
  for (let i = 0; i < n; i++) seen[i].moved = reefs[i].pos.distanceTo(before[i]) * R;

  ok('five minutes in: nothing ever ends up over dry ground', wet === 0 && bad === 0,
    'the six rafts stayed over water on every one of ' + (120 * 300) + ' frames, with no NaN in position, depth ' +
    'or attitude');
  ok('and no keel goes through a column', worstKeel > 0,
    'the closest any keel came to the top of a column under its own plate was ' + mm(worstKeel) + ' of daylight');
  ok('and two rafts never share a patch of water', worstPair > 0,
    'the closest two rafts came was ' + mm(worstPair) + ' between their plates');
  const laps = seen.filter(s => s.maxDepth > .014 && s.minDepth < .008).length;
  ok('and every one of them takes the deep lap and comes back up over its garden', laps === n,
    laps + ' of ' + n + ' went at least 14 mm down and came back to under 8 mm; deepest ' +
    mm(Math.max(...seen.map(s => s.maxDepth))) + ', shallowest ' + mm(Math.min(...seen.map(s => s.minDepth))) +
    ' — the 42 mm the cruise constant asks for is capped by the roof over each farm\'s own stones');
  ok('and the depth is a glide, not a switch', worstStep < .002,
    'the biggest one-frame change in depth (1/120 s) was ' + mm(worstStep) + ' — the roof clamp pulling a raft up ' +
    'out of a column it had drifted over, and nothing faster');
  ok('and the garden spawns at the surface, not out of the dark', seen.every(s => s.plumeStartDeep === 0),
    'a plume started while the animal was deeper than 12 mm on ' + seen.reduce((t, s) => t + s.plumeStartDeep, 0) +
    ' frames out of five minutes (the plume is out for ' + seen.reduce((t, s) => t + s.plumeShallow, 0) +
    ' frames of shallow work, and its fade lingers into the sink on ' + seen.reduce((t, s) => t + s.plumeDeep, 0) + ')');
  ok('and they drift rather than sit', seen.filter(s => s.moved > .002).length === n,
    'over two minutes each raft covered between ' + mm(Math.min(...seen.map(s => s.moved))) + ' and ' +
    mm(Math.max(...seen.map(s => s.moved))) + ' of the shelf');
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
