'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../vortex-model.js');
function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected} (tolerance ${tolerance})`);
}
function integrate(initial, gamma, duration, h, core = V.CORE) {
  let state = Float64Array.from(initial);
  for (let i = 0; i < Math.round(duration / h); i++) {
    state = V.advance(state, gamma, h, core);
    assert.ok(state, 'integration remains finite');
  }
  return Array.from(state);
}

test('the softened Biot–Savart field agrees with the analytical field on the axis', () => {
  const s = [1.2, -.5, .8, .9], gamma = [2.4, -1.1], e = V.CORE;
  for (const z of [-3, -.5, 0, .9, 4]) {
    const expected = gamma[0] * s[0] ** 2 / (2 * (s[0] ** 2 + (z - s[1]) ** 2 + e ** 2) ** 1.5)
      + gamma[1] * s[2] ** 2 / (2 * (s[2] ** 2 + (z - s[3]) ** 2 + e ** 2) ** 1.5);
    const [radial, axial] = V.fieldAt(s, gamma, 0, z);
    close(radial, 0); close(axial, expected, 2e-14);
  }
});

test('ring motion is the same calculated field, with signed radial symmetry and translation invariance', () => {
  const s = [.85, -1.1, 1.2, .6], gamma = [2.5, -1.5], d = V.rates(s, gamma);
  const a = V.fieldAt(s, gamma, s[0], s[1]), b = V.fieldAt(s, gamma, s[2], s[3]);
  close(a[0], d[0], 3e-12); close(a[1], d[1], 3e-12);
  close(b[0], d[2], 3e-12); close(b[1], d[3], 3e-12);
  const negative = V.fieldAt(s, gamma, -.37, .8), positive = V.fieldAt(s, gamma, .37, .8);
  close(negative[0], -positive[0]); close(negative[1], positive[1]);
  const shifted = [s[0], s[1] + 17, s[2], s[3] + 17];
  V.rates(shifted, gamma).forEach((value, i) => close(value, d[i], 1e-12));
  V.rates(s, gamma.map(x => -x)).forEach((value, i) => close(value, -d[i], 1e-12));
});

test('self induction uses the finite core kernel and translates a solitary circular ring', () => {
  for (const radius of [.6, 1, 1.4, 2]) {
    const gamma = 2, e = V.CORE, N = 2048;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const c = Math.cos((i + .5) * 2 * Math.PI / N), numerator = radius * radius * (1 - c);
      sum += numerator / (2 * numerator + e * e) ** 1.5;
    }
    const expected = gamma * sum / (2 * N);
    const [dr, dz] = V.rates([radius, -.2, 1, 3], [gamma, 0]);
    close(dr, 0, 1e-14); close(dz, expected, 2e-6);
    const end = integrate([radius, -.2, 1, 3], [gamma, 0], 1, 1 / 60);
    close(end[0], radius, 1e-12); close(end[1], -.2 + expected, 2e-6);
  }
});

test('the default rings repeatedly leapfrog: inner rings alternate and weighted area is conserved', () => {
  const sim = new V.Experiment([1, -.7, 1, .7], [2, 2]), events = [];
  let maxError = 0, minDistance = Infinity;
  for (let i = 0; i < 30 / V.DT; i++) {
    assert.equal(sim.step(), true);
    if (sim.lastPassage) events.push(sim.lastPassage);
    minDistance = Math.min(minDistance, V.coreDistance(sim.state));
    maxError = Math.max(maxError, Math.abs(sim.areaError()));
  }
  assert.equal(events.length, 4); assert.equal(sim.passages, 4);
  assert.deepEqual(events.map(e => e.inner), ['A', 'B', 'A', 'B']);
  close(events[0].time, 3.4765, .002);
  close(events[1].time - events[0].time, events[2].time - events[1].time, .001);
  assert.ok(minDistance > .7 && maxError < 1e-8, `minimum distance ${minDistance}, area error ${maxError}`);
});

test('oppositely signed rings approach while expanding, without fake passages', () => {
  const sim = new V.Experiment([1, -.9, 1, .9], [2, -2]);
  for (let i = 0; i < 2 / V.DT; i++) assert.equal(sim.step(), true);
  assert.ok(sim.state[0] > 1.4 && sim.state[2] > 1.4);
  assert.ok(sim.state[1] > -.9 && sim.state[3] < .9);
  close(sim.state[0], sim.state[2], 1e-12); close(sim.state[1], -sim.state[3], 1e-12);
  close(V.weightedArea(sim.state, sim.gamma), 0, 1e-12); assert.equal(sim.passages, 0);
});

test('the weighted-area derivative cancels for unequal signed circulations', () => {
  for (const [s, gamma] of [ [[.8, -.4, 1.4, .9], [1.2, 2.7]], [[1.1, .4, .7, -.8], [3, -2]], [[1, 0, 1.3, .2], [0, 0]] ]) {
    const d = V.rates(s, gamma);
    close(2 * gamma[0] * s[0] * d[0] + 2 * gamma[1] * s[2] * d[2], 0, 2e-14);
  }
  V.rates([1, -.5, 1, .5], [0, 0]).forEach(value => close(value, 0));
});

test('RK4 converges at fourth order for the coupled ring dynamics', () => {
  const s = [1, -.7, 1, .7], gamma = [2, 2], duration = 2;
  const exact = integrate(s, gamma, duration, 1 / 960);
  const error = h => Math.hypot(...integrate(s, gamma, duration, h).map((x, i) => x - exact[i]));
  const a = error(1 / 15), b = error(1 / 30), c = error(1 / 60);
  assert.ok(a / b > 13 && a / b < 19 && b / c > 13 && b / c < 19, JSON.stringify({ a, b, c }));
});

test('inputs are validated and step counting is deterministic', () => {
  for (const bad of [[0, 0, 1, 1], [NaN, 0, 1, 1], [1, Infinity, 1, 1], [1, 2, 3]]) {
    assert.throws(() => new V.Experiment(bad, [2, 2]), /Invalid/);
  }
  assert.throws(() => new V.Experiment([1, 0, 1, 1], [2, Infinity]), /Invalid/);
  assert.throws(() => V.fieldAt([1, 0, 1, 1], [2, 2], NaN, 0), /Invalid/);
  assert.throws(() => V.advance([1, 0, 1, 1], [2, 2], NaN), /Invalid/);
  const a = new V.Experiment([1, -.7, 1, .7], [2, 2]), b = new V.Experiment([1, -.7, 1, .7], [2, 2]);
  for (let i = 0; i < 500; i++) { assert.ok(a.step()); assert.ok(b.step()); }
  assert.deepEqual(Array.from(a.state), Array.from(b.state)); close(a.time(), 500 / 120);
});

test('a passage exactly on a timestep boundary is counted once, but a touch or initial tie is not', () => {
  const a = [0.7, -0.1, 1.3, 0.1], tie = [0.7, 0, 1.3, 0], b = [0.7, 0.1, 1.3, -0.1];
  const crossing = new V.Experiment(a, [2, 2]);
  crossing._trackPassage(a, tie); assert.equal(crossing.passages, 0); crossing.steps++;
  crossing._trackPassage(tie, tie); assert.equal(crossing.passages, 0); crossing.steps++;
  crossing._trackPassage(tie, b); assert.equal(crossing.passages, 1);
  close(crossing.lastPassage.time, V.DT); assert.equal(crossing.lastPassage.inner, 'A');
  crossing.steps++; crossing._trackPassage(b, b); assert.equal(crossing.passages, 1); assert.equal(crossing.lastPassage, null);
  const touching = new V.Experiment(a, [2, 2]);
  touching._trackPassage(a, tie); touching.steps++; touching._trackPassage(tie, a); assert.equal(touching.passages, 0);
  const starting = new V.Experiment(tie, [2, 2]);
  starting._trackPassage(tie, b); assert.equal(starting.passages, 0);
  const tooClose = new V.Experiment([1, -.1, 1.1, .1], [2, 2]);
  tooClose._trackPassage([1, -.1, 1.1, .1], [1, .1, 1.1, -.1]); assert.equal(tooClose.passages, 0);
});

test('the 256-point kernel stays accurate against a fine independent quadrature near the display limits', () => {
  const cases = [
    [[2.4, -.15, 2.4, .15], [3.5, -3.5]],
    [[2.3, 0, 2.4, .3], [3.5, 3.5]],
    [[.35, -.15, .35, .15], [.5, -3.5]],
    [[.4, 0, 2.4, .1], [2.5, 1.5]]
  ], n = 4096;
  function reference(s, gamma, ring) {
    const r = s[ring * 2], z = s[ring * 2 + 1]; let radial = 0, axial = 0;
    for (let j = 0; j < 2; j++) {
      const R = s[j * 2], Z = s[j * 2 + 1];
      for (let i = 0; i < n; i++) {
        const c = Math.cos((i + .5) * 2 * Math.PI / n), d2 = r*r + R*R - 2*r*R*c + (z-Z)**2 + V.CORE**2;
        const factor = gamma[j] / (2 * n * d2 * Math.sqrt(d2));
        radial += factor * R * (z-Z) * c; axial += factor * (R*R - R*r*c);
      }
    }
    return [radial, axial];
  }
  for (const [s, gamma] of cases) {
    const actual = V.rates(s, gamma);
    for (let i = 0; i < 2; i++) {
      const expected = reference(s, gamma, i);
      close(actual[i*2], expected[0], 4e-6); close(actual[i*2+1], expected[1], 4e-6);
    }
  }
});

test('unequal-circulation comparison stays within the guarded region over 100 simulated time units', () => {
  const sim = new V.Experiment([1, -.5, .85, .5], [2.5, 1.5]);
  let minRadius = Infinity, maxRadius = 0, minDistance = Infinity, maxGap = 0;
  for (let i = 0; i < 100 / V.DT; i++) {
    assert.equal(sim.step(), true);
    const s = sim.state;
    minRadius = Math.min(minRadius, s[0], s[2]); maxRadius = Math.max(maxRadius, s[0], s[2]);
    minDistance = Math.min(minDistance, V.coreDistance(s)); maxGap = Math.max(maxGap, Math.abs(s[3] - s[1]));
  }
  assert.ok(minRadius > .4 && maxRadius < 2.4 && minDistance > 2.5 * V.CORE && maxGap < 3.2,
    JSON.stringify({ minRadius, maxRadius, minDistance, maxGap }));
  assert.ok(sim.passages >= 20 && Math.abs(sim.areaError()) < 1e-8);
  // The former 1.4 separation stopped because B contracted below the radius
  // guard, not because the ring centerlines became too close.
  const former = new V.Experiment([1, -.7, .85, .7], [2.5, 1.5]);
  while (former.time() < 11 && former.state[2] >= .35) assert.equal(former.step(), true);
  assert.ok(former.state[2] < .35 && V.coreDistance(former.state) > .6);
});
