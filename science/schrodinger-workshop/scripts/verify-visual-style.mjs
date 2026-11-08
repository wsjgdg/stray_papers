import assert from 'node:assert/strict';
import { CSS } from '../src/core/styles.js';

assert.match(CSS, /\.panel\{position:fixed;\s*background:linear-gradient\(135deg,rgba\(103,232,249/,
  'shared panels should use a subtle cyan/magenta glass surface');
assert.match(CSS, /button\{font-family:var\(--sans\);font-size:12px;color:var\(--txt\);\s*background:linear-gradient\(180deg/,
  'shared controls should have a dimensional surface, not a flat fill');
assert.match(CSS, /\.qhud \.hrow span:last-child\{font-variant-numeric:tabular-nums/,
  'numeric HUD values should align consistently');
assert.match(CSS, /button:active:not\(:disabled\)\{translate:0 1px;/,
  'buttons should have tactile press feedback without overriding component transforms');
assert.match(CSS, /button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible/,
  'keyboard users should get a visible focus indicator on shared controls');
assert.match(CSS, /outline:2px solid var\(--cyan\);outline-offset:2px/,
  'focus indicator should use the shared high-contrast accent');
assert.ok(CSS.indexOf('input[type=range]') < CSS.indexOf('button:focus-visible'),
  'focus rules must follow range/select defaults so they remain visible');
assert.match(CSS, /@media \(prefers-reduced-motion:reduce\)/,
  'respect the operating system reduced-motion preference');
assert.match(CSS, /transition-duration:\.01ms!important/,
  'reduced-motion preference should shorten shared transitions');
console.log('Shared visual interaction states: focus, press feedback, and reduced-motion rules PASS');
