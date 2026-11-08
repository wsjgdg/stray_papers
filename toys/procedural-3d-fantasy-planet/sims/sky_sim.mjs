// What is above: the sun-mirror net, the storm, and the thunder that has to arrive with the lightning.
//
// Two of the user's acceptance criteria live here. `-64`: 抬头必须看见那十几块亮镜 — look up and there have to be
// a dozen bright mirrors. And: 雨天打雷的频率和时长不固定，且雷必须有声音 — the storm's strikes may not be
// metronomic and the thunder may not be missing.
//
// The bench has no browser and no AudioContext, so what is checked about the thunder is the plan it is built
// from — one pure function the page exposes for exactly this reason (`-64`).
import { buildWorld } from './world.mjs';

const world = await buildWorld();
const { THREE, R, SEA, camera, scene, state, latticeRings, updateLattice, updateWeather, weather, setWeather,
  nextStrikeGap, thunderPlan, EYE, heightAt, resetGroundMotion, keys } = world;

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => {
  if (cond) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const mm = v => (v * 1000).toFixed(1) + ' mm';
const dt = 1 / 120;

keys.clear();
resetGroundMotion();
state.mode = 'ground'; state.transition = null;
state.direction.copy(world.nearestLand(new THREE.Vector3(Math.sin(1.16) * Math.sin(.42), Math.cos(1.16), Math.sin(1.16) * Math.cos(.42))));
state.radius = R + Math.max(heightAt(state.direction), SEA) + EYE;

// ---- the net ---------------------------------------------------------------------------------------------
{
  const panels = latticeRings.map(ring => ring.count);
  let highest = 0, lowest = Infinity, outside = 0;
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (const ring of latticeRings) {
    for (let i = 0; i < ring.mesh.count; i++) {
      ring.mesh.getMatrixAt(i, m);
      p.setFromMatrixPosition(m).applyMatrix4(ring.mesh.matrixWorld);
      const radius = p.length();
      highest = Math.max(highest, radius); lowest = Math.min(lowest, radius);
      if (radius < R * 1.6) outside++;
    }
  }
  ok('there are two bands of mirrors, well above the ground', panels.length === 2 && outside === 0,
    panels.join(' and ') + ' panels (' + (panels[0] + panels[1]) + ' in all), from ' +
    (lowest / R).toFixed(2) + ' to ' + (highest / R).toFixed(2) + ' planet radii out — the ground is at 1.00');
}

// ---- look up: the dozen bright ones ----------------------------------------------------------------------
{
  // Night, clear: the net's own looking-up condition. Every panel's brightness is its instance colour, which the
  // page writes each frame; over a full slow roll of both bands, how many are lit at once?
  const lit = [];
  const dt2 = .25;
  for (let t = 0; t < 600; t += dt2) {
    updateLattice(t, 0, 0, state.direction, 0);
    let count = 0, brightest = 0;
    for (const ring of latticeRings) {
      const colour = ring.mesh.instanceColor;
      if (!colour) continue;
      for (let i = 0; i < ring.mesh.count; i++) {
        const v = Math.max(colour.array[i * 3], colour.array[i * 3 + 1], colour.array[i * 3 + 2]);
        if (v > .08) count++;
        brightest = Math.max(brightest, v);
      }
    }
    lit.push({ count, brightest });
  }
  const counts = lit.map(l => l.count);
  const worst = Math.min(...counts), best = Math.max(...counts);
  const brightest = Math.max(...lit.map(l => l.brightest));
  ok('looking up at night, a dozen of them are lit — at every moment of ten minutes', worst >= 12,
    'over 600 seconds of the bands turning: the fewest panels lit at once was ' + worst + ', the most ' + best +
    ', the brightest reading ' + brightest.toFixed(2) + ' (a panel counts as lit above .08)');
}
{
  // No flicker: the panel brightness changes by a fraction of itself per frame, not by jumping.
  let worstStep = 0;
  let before = null;
  for (let t = 0; t < 120; t += dt) {
    updateLattice(t, 0, 0, state.direction, 0);
    const now = latticeRings.map(ring => {
      const colour = ring.mesh.instanceColor;
      if (!colour) return [];
      return Array.from(colour.array.slice(0, ring.mesh.count * 3));
    });
    if (before) {
      for (let r = 0; r < now.length; r++) {
        for (let i = 0; i < Math.min(now[r].length, before[r].length); i++) {
          worstStep = Math.max(worstStep, Math.abs(now[r][i] - before[r][i]));
        }
      }
    }
    before = now;
  }
  ok('and they do not flicker', worstStep < .05,
    'the biggest change in any panel channel between two frames was ' + worstStep.toFixed(4) + ' of full brightness');
}
{
  // By day the net is not a light show: the page switches it to plain blending and takes the glow away.
  updateLattice(0, 1, 0, state.direction, 0);
  const dayBright = latticeRings.reduce((s, ring) => s + Math.max(0, ...Array.from(ring.mesh.instanceColor.array)), 0);
  const dayGlow = latticeRings.filter(ring => ring.glowMesh.visible).length;
  updateLattice(0, 0, 0, state.direction, 0);
  const nightBright = latticeRings.reduce((s, ring) => s + Math.max(0, ...Array.from(ring.mesh.instanceColor.array)), 0);
  ok('and by day the net goes quiet instead of becoming a chandelier', dayBright < nightBright && dayGlow === 0,
    'brightest panel at noon ' + dayBright.toFixed(2) + ' against ' + nightBright.toFixed(2) + ' at night, with the ' +
    'halo meshes off in daylight (' + dayGlow + ' still showing)');
}

// ---- the storm -------------------------------------------------------------------------------------------
{
  setWeather('storm');
  weather.auto = false;
  const starts = [];
  let wasLife = 0;
  let elapsed = 0;
  while (elapsed < 900) {
    updateWeather(dt);
    elapsed += dt;
    if (weather.boltLife > wasLife + .05) starts.push({ at: elapsed, span: weather.boltSpan });
    wasLife = weather.boltLife;
  }
  const waits = starts.slice(1).map((s, i) => s.at - starts[i].at);
  const mean = waits.reduce((s, v) => s + v, 0) / Math.max(1, waits.length);
  const sd = Math.sqrt(waits.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, waits.length));
  const spread = sd / Math.max(.001, mean);
  ok('a storm strikes, and not on a beat', starts.length >= 6 && spread > .25,
    'fifteen minutes of storm: ' + starts.length + ' strikes, ' + waits.length + ' gaps averaging ' +
    mean.toFixed(1) + ' s, spread ' + (spread * 100).toFixed(0) + '% (' + Math.min(...waits).toFixed(1) +
    ' s at the shortest, ' + Math.max(...waits).toFixed(1) + ' s at the longest)');
  ok('and the flashes are not all the same length', new Set(starts.map(s => s.span.toFixed(2))).size >= 3,
    [...new Set(starts.map(s => s.span.toFixed(2)))].length + ' distinct bolt lengths over ' + starts.length +
    ' strikes: ' + [...new Set(starts.map(s => s.span.toFixed(2)))].slice(0, 8).join(', ') + ' s');
}
{
  // The air has to stay a number the shader can use, and it has to change with the weather.
  // Measured across a *change* of weather, not inside a settled one: the air blends towards the front's own
  // numbers at 1.65 a second, so after half a minute it is simply where it was going.
  setWeather('clear');
  weather.auto = false;
  for (let f = 0; f < 120 * 20; f++) updateWeather(dt);
  const before = { fog: weather.now.fog, cloud: weather.now.cloud };
  setWeather('storm');
  let min = Infinity, max = -Infinity, bad = 0, cloudMin = Infinity, cloudMax = -Infinity;
  for (let f = 0; f < 120 * 12; f++) {
    updateWeather(dt);
    const fog = weather.now.fog, cloud = weather.now.cloud;
    if (!Number.isFinite(fog) || !Number.isFinite(cloud)) bad++;
    min = Math.min(min, fog); max = Math.max(max, fog);
    cloudMin = Math.min(cloudMin, cloud); cloudMax = Math.max(cloudMax, cloud);
  }
  ok('and the air is a finite, changing thickness', bad === 0 && max > min && cloudMax > cloudMin,
    'clear air settles at fog ' + before.fog.toFixed(2) + '/cloud ' + before.cloud.toFixed(2) + '; twelve seconds into ' +
    'a storm it had moved through ' + min.toFixed(2) + '-' + max.toFixed(2) + ' of fog and ' + cloudMin.toFixed(2) +
    '-' + cloudMax.toFixed(2) + ' of cloud, and no value was ever not a number');
}

// ---- the thunder -----------------------------------------------------------------------------------------
{
  // Thunder is one pure function of distance: when you hear it, how loud, how long, and how much top end it has.
  // Close is a crack, far is a long roll — and every strike has some, which is the part the user asked for.
  const near = thunderPlan(.5, 1);
  const mid = thunderPlan(8, 1);
  const far = thunderPlan(40, 1);
  // Delay grows with distance, close thunder keeps its top end (a crack), far thunder loses it (a roll), and the
  // lengths are not one number.
  const monotone = near.delay < mid.delay && mid.delay < far.delay;
  const muffled = near.lobes[0].cutoff > far.lobes[0].cutoff;
  const cracks = near.crack > .3 && far.crack === 0;
  const lengths = new Set();
  for (let i = 0; i < 60; i++) lengths.add(thunderPlan(i * .7, 1).length.toFixed(1));
  ok('thunder follows the lightning, close is a crack and far is a roll', monotone && muffled && cracks && lengths.size > 8,
    'delay ' + near.delay.toFixed(2) + ' s at half a unit away, ' + mid.delay.toFixed(2) + ' at eight, ' +
    far.delay.toFixed(2) + ' at forty; top end ' + near.lobes[0].cutoff.toFixed(0) + ' Hz close against ' +
    far.lobes[0].cutoff.toFixed(0) + ' Hz far; crack ' + near.crack.toFixed(2) + ' close, ' + far.crack.toFixed(2) +
    ' far; ' + lengths.size + ' distinct roll lengths in sixty plans');
}
{
  // And no strike is silent: every plan has at least one lobe with real level in it.
  let silent = 0, plans = 0, loudest = 0;
  for (let i = 0; i < 400; i++) {
    const plan = thunderPlan(i / 400 * 60, 1);
    plans++;
    const level = plan.lobes.reduce((m, l) => Math.max(m, l.level), 0);
    if (!(level > .05) || !Number.isFinite(plan.delay) || !Number.isFinite(plan.length)) silent++;
    loudest = Math.max(loudest, level);
  }
  ok('and every strike makes a sound', silent === 0,
    plans + ' thunder plans across the whole range of distances: none silent or malformed, the loudest lobe ' +
    loudest.toFixed(2));
}

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
