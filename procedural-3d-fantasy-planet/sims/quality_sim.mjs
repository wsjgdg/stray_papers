// Adaptive quality, driven by the page's actual controller and applyQuality, not a copied algorithm.
// The renderer is a recorder: this suite verifies decisions and render settings, not achieved GPU speed.
import { buildWorld } from './world.mjs';

const w = await buildWorld();
const { quality, updateQuality, applyQuality, cycleQuality, qualityButton, qualityVisuals, getDiagnostics,
  renderer, state, rebaseFrameClock, setDocumentHidden } = w;
let pass = 0, fail = 0;
const ok = (name, condition, info = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const reset = () => {
  setDocumentHidden(false);
  state.transition = null;
  quality.mode = 'auto'; quality.tier = 0; quality.average = 1 / 60;
  applyQuality();
};
const feed = (interval, frames) => {
  let peak = quality.tier;
  for (let i = 0; i < frames; i++) {
    // The second argument mirrors the page's former fixed-step interface for negative controls.
    updateQuality(interval, Math.min(interval, .05));
    peak = Math.max(peak, quality.tier);
  }
  return peak;
};

reset();
feed(1 / 60, 60 * 40);
ok('a steady 60 Hz stays at AUTO HIGH', quality.mode === 'auto' && quality.tier === 0 &&
  qualityButton.textContent === 'AUTO / HIGH', 'average ' + (1000 * quality.average).toFixed(1) + ' ms');

reset();
feed(1 / 30, 30 * 15);
const thirtyFirst = quality.tier;
feed(1 / 30, 30 * 15);
ok('sustained 30 Hz steps down with cooldown rather than freezing', thirtyFirst === 1 && quality.tier === 2,
  'at 15 s tier ' + thirtyFirst + ', at 30 s tier ' + quality.tier);

reset();
let tier1At = 0, tier2At = 0;
for (let i = 1; i <= 50; i++) {
  feed(.2, 1);
  if (!tier1At && quality.tier >= 1) tier1At = i * .2;
  if (!tier2At && quality.tier >= 2) tier2At = i * .2;
}
ok('sustained 5 Hz is measured and reaches both lower tiers', tier1At > 0 && tier1At <= 5 &&
  tier2At > tier1At && tier2At <= 10,
  'HIGH → BALANCED at ' + tier1At.toFixed(1) + ' s; SMOOTH at ' + tier2At.toFixed(1) + ' s');

reset();
feed(1, 8);
ok('even a sustained 1 Hz does not leave automatic quality stuck at HIGH', quality.tier === 2,
  'after eight one-second frames: tier ' + quality.tier);

reset();
feed(1 / 60, 60 * 15);
let worst = feed(10, 1); // a single long main-thread stall must not look like a sustained slow renderer
const reportedSlow = getDiagnostics().estimatedFps;
worst = Math.max(worst, feed(1 / 60, 60 * 8));
const reportedFast = getDiagnostics().estimatedFps;
ok('one ten-second stall followed by good frames never forces a lower tier', worst === 0,
  'highest tier reached ' + worst + ', final average ' + (1000 * quality.average).toFixed(1) + ' ms');
ok('diagnostics report real slow intervals, independent of the capped decision sample',
  Math.abs(reportedSlow - .1) < .01 && reportedFast >= 59 && reportedFast <= 61,
  reportedSlow + ' fps for a ten-second frame; ' + reportedFast + ' fps after recovery');

reset();
quality.tier = 2; applyQuality();
feed(1 / 60, 60 * 21);
const recovered = quality.tier;
feed(1 / 60, 60 * 21);
ok('a sustained recovery climbs one tier at a time', recovered === 1 && quality.tier === 0,
  'tier after 21 s ' + recovered + ', after 42 s ' + quality.tier);

reset();
cycleQuality();
feed(.2, 60);
const lockedHigh = quality.mode === 'high' && quality.tier === 0 && qualityButton.textContent === 'LOCKED / HIGH';
cycleQuality();
feed(.2, 60);
const lockedBalanced = quality.mode === 'balanced' && quality.tier === 1 && qualityButton.textContent === 'LOCKED / BALANCED';
cycleQuality();
ok('locked choices ignore low frame rates and Q returns to AUTO', lockedHigh && lockedBalanced &&
  quality.mode === 'auto' && quality.tier === 0 && qualityButton.textContent === 'AUTO / HIGH');

reset();
const full = { ratio: renderer.getPixelRatio(), ...qualityVisuals() };
quality.tier = 1; applyQuality();
const balanced = { ratio: renderer.getPixelRatio(), ...qualityVisuals() };
quality.tier = 2; applyQuality();
const smooth = { ratio: renderer.getPixelRatio(), ...qualityVisuals() };
quality.tier = 0; applyQuality();
const restored = { ratio: renderer.getPixelRatio(), ...qualityVisuals() };
ok('at 1× pixel density the lower tiers actually reduce render resolution',
  Math.abs(full.ratio - 1) < 1e-9 && balanced.ratio < full.ratio && smooth.ratio < balanced.ratio &&
  Math.abs(restored.ratio - full.ratio) < 1e-9,
  'HIGH ' + full.ratio.toFixed(2) + ', BALANCED ' + balanced.ratio.toFixed(2) + ', SMOOTH ' + smooth.ratio.toFixed(2));
ok('SMOOTH reduces cloud and weather work and HIGH restores it', full.highCloud && !smooth.highCloud &&
  restored.highCloud && smooth.weatherCount < full.weatherCount && restored.weatherCount === full.weatherCount,
  'weather vertices ' + full.weatherCount + ' → ' + smooth.weatherCount + ' → ' + restored.weatherCount);

reset();
state.transition = {};
feed(.2, 30);
const duringFlight = quality.tier;
state.transition = null;
feed(.2, 25);
ok('no tier changes mid-transition; persistent slow frames can downgrade after arrival',
  duringFlight === 0 && quality.tier > 0, 'in flight ' + duringFlight + ', after arrival ' + quality.tier);

reset();
feed(.2, 7);
const beforeHidden = JSON.stringify(quality);
setDocumentHidden(true);
feed(.2, 60);
const hiddenUnchanged = JSON.stringify(quality) === beforeHidden;
setDocumentHidden(false);
rebaseFrameClock();
feed(.2, 1);
ok('hidden time is ignored and a resumed clock does not reuse old slow-frame evidence',
  hiddenUnchanged && quality.tier === 0, 'tier after resume ' + quality.tier);

reset();
const beforeInvalid = JSON.stringify(quality);
for (const raw of [NaN, Infinity, -Infinity, -1, 0]) updateQuality(raw, Math.min(raw, .05));
ok('invalid frame intervals cannot poison the quality controller',
  Number.isFinite(quality.average) && JSON.stringify(quality) === beforeInvalid);

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
