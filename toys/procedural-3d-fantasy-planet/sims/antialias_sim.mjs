// Context antialiasing is a startup decision, separate from the live Q/quality controller.
// This runs the shipped policy and page with a renderer recorder; it does not measure GPU speed.
import { buildWorld } from './world.mjs';

const w = await buildWorld();
const { antialiasPolicy, quality, applyQuality, qualityButton, renderer, getDiagnostics } = w;
let pass = 0, fail = 0;
const ok = (name, condition, info = '') => {
  if (condition) { pass++; console.log('  PASS ' + name + (info ? ' — ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? ' — ' + info : '')); }
};
const policy = (gpu, choice) => antialiasPolicy ? antialiasPolicy(gpu, choice) : {};
const is = (p, mode, requested) => p.mode === mode && p.requested === requested;

ok('recognized SwiftShader defaults to no multisampling',
  is(policy('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', null), 'auto', false) &&
  is(policy('swiftshader', ''), 'auto', false));
ok('hardware, unknown, masked, and unrelated software names keep the previous default',
  ['NVIDIA GeForce', 'Apple GPU', 'Intel Iris', 'WebKit WebGL', 'llvmpipe', '', null]
    .every(gpu => is(policy(gpu, null), 'auto', true)));
ok('an explicit on overrides the software fallback',
  is(policy('SwiftShader Device', 'on'), 'on', true) && is(policy('swiftshader', '  ON '), 'on', true));
ok('an explicit off works regardless of the renderer',
  is(policy('NVIDIA GeForce', 'off'), 'off', false) && is(policy('SwiftShader', 'OFF'), 'off', false));
ok('unknown choices do not unexpectedly disable hardware antialiasing',
  is(policy('NVIDIA GeForce', 'low'), 'auto', true) && is(policy('SwiftShader', 'low'), 'auto', false));

const before = getDiagnostics();
ok('the actual renderer request and diagnostics follow the default policy',
  renderer.options.antialias === true && before.antialiasMode === 'auto' && before.antialiasRequested === true);
ok('an unavailable context reports unknown rather than inventing an actual setting', before.antialias === null);
quality.tier = 2; applyQuality();
const after = getDiagnostics();
ok('changing live quality does not silently change the fixed context request',
  renderer.options.antialias === true && after.antialiasMode === before.antialiasMode &&
  after.antialiasRequested === before.antialiasRequested && after.antialias === before.antialias);
ok('the quality tooltip describes the setting and reload override',
  qualityButton.title?.includes('Antialiasing unknown') && qualityButton.title.includes('aa=on') &&
  qualityButton.title.includes('aa=off') && qualityButton.getAttribute('aria-label')?.includes('Antialiasing unknown'));

console.log('\n' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
