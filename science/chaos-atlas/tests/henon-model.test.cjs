'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../henon-model.js');

function close(actual, expected, tolerance = 1e-10, message = 'values differ') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}
function make(E, x, y, angleDegrees) { return new H.Experiment(H.initialState(E, x, y, angleDegrees * Math.PI / 180)); }
function sample(sim, target, maxSteps = 240 * 920) {
  const points = [];
  let maxError = 0;
  for (let i = 0; i < maxSteps && points.length < target; i++) {
    assert.equal(sim.step(), true);
    if (sim.lastCrossing) points.push(sim.lastCrossing);
    maxError = Math.max(maxError, Math.abs(sim.energyError()));
    if (H.outsideObservation(sim.state, 1.5)) break;
  }
  return { points, maxError };
}

test('the three escape saddles have energy 1/6 and zero gradient', () => {
  assert.deepEqual(H.gradient(0, 0), [0, 0]);
  close(H.potential(0, 0), 0);
  for (const [x, y] of H.SADDLES) {
    close(H.potential(x, y), 1 / 6, 1e-14);
    H.gradient(x, y).forEach(v => close(v, 0, 1e-14));
    const trace = (1 + 2 * y) + (1 - 2 * y), det = (1 + 2 * y) * (1 - 2 * y) - 4 * x * x;
    close(trace, 2); close(det, -3);
  }
});

test('force is the negative potential gradient and the initial state matches the requested energy', () => {
  for (const [x, y] of [[.2, -.3], [-.4, .1], [.5, .4]]) {
    const d = 1e-6, [gx, gy] = H.gradient(x, y);
    close((H.potential(x + d, y) - H.potential(x - d, y)) / (2 * d), gx, 2e-10);
    close((H.potential(x, y + d) - H.potential(x, y - d)) / (2 * d), gy, 2e-10);
    const initial = H.initialState(.3, x, y, 1.1);
    close(H.energy(initial), .3, 1e-14);
    const h = 1e-6, next = H.advance(initial, h);
    close((next[2] - initial[2]) / h, -gx, 1e-6);
    close((next[3] - initial[3]) / h, -gy, 1e-6);
  }
  assert.throws(() => H.initialState(.01, .5, 0, 0), /exceeds/);
  assert.throws(() => H.initialState(.1, NaN, 0, 0), /finite/);
  assert.throws(() => new H.Experiment([0, 0, Infinity, 0]), /Invalid/);
});

test('terrain ray picking finds the true visible cubic, nearest branch and tangencies', () => {
  const vertical = H.intersectPotentialRay([.2, -.1, 1], [0, 0, -1]);
  close(vertical.x, .2); close(vertical.y, -.1); close(vertical.v, H.potential(.2, -.1));
  close(vertical.t, 1 - vertical.v);
  assert.equal(H.intersectPotentialRay([.2, -.1, 1], [0, 0, 1]), null);
  assert.equal(H.intersectPotentialRay([2, 0, 1], [0, 0, -1]), null);
  assert.equal(H.intersectPotentialRay([1, .3, 2], [0, 0, -1]), null, 'surface above the visual cap is clipped');
  assert.equal(H.intersectPotentialRay([0, 0, 1], [0, 0, 0]), null);
  assert.equal(H.intersectPotentialRay([NaN, 0, 1], [0, 0, -1]), null);
  const multiple = H.intersectPotentialRay([0, -2, .1], [0, 1, 0]);
  assert.ok(multiple && multiple.y < 0, 'choose the first visible branch');
  close(multiple.v, .1, 1e-10);
  const tangent = H.intersectPotentialRay([0, -1, 0], [0, 1, 0]);
  assert.ok(tangent && Math.abs(tangent.y) < 1e-8, 'a tangent without a sign change still intersects');
  close(tangent.v, 0, 1e-12);
  for (let i = 0; i < 80; i++) {
    const x = -.6 + i * .015, y = .2 * Math.sin(i), height = H.potential(x, y);
    const hit = H.intersectPotentialRay([x, y, height + 1], [0, 0, -1]);
    assert.ok(hit); close(hit.x, x); close(hit.y, y); close(hit.v, height);
  }
});

test('the central equilibrium and exactly symmetric axis remain invariant', () => {
  const rest = new H.Experiment([0, 0, 0, 0]);
  for (let i = 0; i < 1000; i++) assert.equal(rest.step(), true);
  assert.deepEqual(Array.from(rest.state), [0, 0, 0, 0]);
  assert.equal(rest.energy(), 0); assert.equal(rest.energyError(), 0);
  const axis = new H.Experiment([0, 0, 0, Math.sqrt(.16)]);
  for (let i = 0; i < 240 * 100; i++) assert.equal(axis.step(), true);
  close(axis.state[0], 0, 1e-14); close(axis.state[2], 0, 1e-14);
  assert.ok(Math.abs(axis.energyError()) < 1e-9);
});

test('a section selection reconstructs the positive momentum at exactly the chosen energy', () => {
  for (const [E, x, px] of [[.125, .15, -.2], [.2, -.3, .25], [.03, 0, 0], [.24, .1, -.6]]) {
    const initial = H.sectionInitialState(E, x, px);
    close(initial[0], x); close(initial[1], 0); close(initial[2], px);
    assert.ok(initial[3] > 0); close(H.energy(initial), E, 1e-14);
    const angle = Math.atan2(initial[3], initial[2]);
    const fromControls = H.initialState(E, x, 0, angle);
    fromControls.forEach((v, i) => close(v, initial[i], 1e-14));
  }
  const E = .125;
  assert.throws(() => H.sectionInitialState(E, .5, 0), /strictly inside/, 'p_y=0 is not an upward crossing');
  assert.throws(() => H.sectionInitialState(E, .51, 0), /strictly inside/);
  assert.throws(() => H.sectionInitialState(0, 0, 0), /strictly inside/);
  assert.throws(() => H.sectionInitialState(-1, 0, 0), /strictly inside/);
  assert.throws(() => H.sectionInitialState(Number.MAX_VALUE, 0, 0), /strictly inside/);
  for (const args of [[NaN, 0, 0], [Infinity, 0, 0], [E, -Infinity, 0], [E, 0, NaN], [E, 0, Infinity]]) {
    assert.throws(() => H.sectionInitialState(...args), /finite/);
  }
  const nearBoundary = H.sectionInitialState(E, .5 - 1e-9, 0);
  assert.ok(nearBoundary[3] > 0 && nearBoundary[3] < .0001); close(H.energy(nearBoundary), E, 1e-14);
});

test('directed Poincaré crossings interpolate y=0 only on upward passages', () => {
  const a = [-.2, -.01, .15, .4], b = [.1, .03, .3, .5];
  const hit = H.sectionCrossing(a, b);
  close(hit.fraction, .25); close(hit.x, -.125); close(hit.px, .1875); close(hit.py, .425);
  assert.equal(H.sectionCrossing(b, a), null);
  assert.equal(H.sectionCrossing([0, -.1, 0, -.3], [0, .1, 0, -.2]), null);
  assert.equal(H.sectionCrossing([0, -.1, 0, .2], [0, 0, 0, .3]), null);
  assert.ok(H.sectionCrossing([0, 0, 0, .3], [0, .1, 0, .4]));
});

test('two initial conditions at the same sub-saddle energy produce distinct measured section patterns', () => {
  const regular = make(.125, .15, 0, 90), complex = make(.125, .2, 0, 101);
  const a = sample(regular, 100), b = sample(complex, 100);
  assert.equal(a.points.length, 100); assert.equal(b.points.length, 100);
  assert.ok(a.maxError < 1e-9 && b.maxError < 1e-9);
  assert.ok(Math.min(...a.points.map(p => p.x)) < -.1 && Math.max(...a.points.map(p => p.x)) > .1);
  assert.ok(a.points.every(p => Math.abs(p.x) < .2 && Math.abs(p.px) < .13), 'the regular preset stays near the central island during sampling');
  for (const sx of [-1, 1]) for (const sp of [-1, 1])
    assert.ok(a.points.some(p => sx * p.x > .02 && sp * p.px > .01), 'sampled ring has points in every quadrant');
  assert.ok(Math.min(...b.points.map(p => p.x)) < -.4 && Math.max(...b.points.map(p => p.x)) > .4,
    'the other orbit explores a much wider section over the same energy and sampled interval');
  for (const point of [...a.points, ...b.points]) {
    assert.ok(point.py > 0);
    const approximateSectionEnergy = .5 * (point.x ** 2 + point.px ** 2 + point.py ** 2);
    assert.ok(Math.abs(approximateSectionEnergy - .125) < 3e-6, 'interpolated crossing lies close to the energy shell');
  }
  assert.equal(H.outsideObservation(regular.state, 1.5), false);
  assert.equal(H.outsideObservation(complex.state, 1.5), false);
});

test('an above-saddle axial launch crosses the finite observation boundary without faking an escape', () => {
  const sim = make(.2, 0, 0, 90);
  let crossed = false;
  for (let i = 0; i < 240 * 10; i++) {
    assert.equal(sim.step(), true);
    if (H.outsideObservation(sim.state, 1.5)) { crossed = true; break; }
  }
  assert.ok(crossed && sim.time() > 3 && sim.time() < 5);
  assert.ok(sim.state[1] >= 1.5 && Math.abs(sim.state[0]) < 1e-10);
  assert.ok(Math.abs(sim.energyError()) < 1e-9);
  assert.equal(H.outsideObservation([1.6, 0, -1, 0], 1.5), false, 'inward motion is not an outward crossing');
});

test('RK4 converges at fourth order for a short bounded trajectory', () => {
  const initial = H.initialState(.16, .2, 0, 101 * Math.PI / 180);
  function integrate(h) {
    let s = Float64Array.from(initial), out = new Float64Array(4);
    for (let i = 0; i < Math.round(5 / h); i++) { H.advance(s, h, out); [s, out] = [out, s]; }
    return Array.from(s);
  }
  const reference = integrate(.00125), coarse = integrate(.04), fine = integrate(.02);
  const distance = v => Math.hypot(...v.map((value, i) => value - reference[i]));
  assert.ok(distance(coarse) / distance(fine) > 13, `expected fourth-order convergence: ${distance(coarse)} vs ${distance(fine)}`);
});
