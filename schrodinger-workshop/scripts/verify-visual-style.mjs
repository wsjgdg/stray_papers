import assert from 'node:assert/strict';
import { CSS } from '../src/core/styles.js';

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
