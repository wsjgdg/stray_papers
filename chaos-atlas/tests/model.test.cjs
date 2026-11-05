'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

function close(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    (message || 'values differ') + ': expected ' + expected + ', got ' + actual);
}
function integrate(system, point, parameter, dt, steps) {
  for (let i = 0; i < steps; i++) point = model.rk4Step(system, point, dt, parameter);
  return point;
}

const linear = {
  dt: 0.01,
  derivative: ([x, y, z]) => [0.4 * x, -0.2 * y, 0.1 * z],
  parameter: { min: 0, max: 1, value: 0 }
};

test('RK4 matches a system with a known exponential solution', () => {
  const result = integrate(linear, [1, 2, -1], 0, 0.01, 1000);
  close(result[0], Math.exp(4), 2e-9);
  close(result[1], 2 * Math.exp(-2), 1e-10);
  close(result[2], -Math.exp(1), 1e-11);
});

test('Lorenz equilibria and the classical stability boundary are correct', () => {
  const s = model.systems.lorenz, rho = 28;
  assert.deepEqual(s.derivative([0, 0, 0], rho), [0, 0, 0]);
  const x = Math.sqrt(model.BETA * (rho - 1));
  for (const sign of [-1, 1]) {
    const fixed = [sign * x, sign * x, rho - 1];
    s.derivative(fixed, rho).forEach(value => close(value, 0, 1e-12));
  }
  close(model.LORENZ_HOPF, 24.736842105263158, 1e-12);
  assert.match(s.regime(0.5).label, /One locally stable/);
  assert.match(s.regime(15).label, /Two locally stable/);
  assert.match(s.regime(28).label, /unstable/);
});

test('analytical divergence agrees with the derivative Jacobian', () => {
  for (const system of Object.values(model.systems)) {
    const point = [1.23, -2.1, 3.4], p = system.parameter.value, h = 1e-5;
    let numerical = 0;
    for (let axis = 0; axis < 3; axis++) {
      const plus = point.slice(), minus = point.slice();
      plus[axis] += h; minus[axis] -= h;
      numerical += (system.derivative(plus, p)[axis] - system.derivative(minus, p)[axis]) / (2 * h);
    }
    close(numerical, system.divergence(point, p), 1e-8, system.name + ' divergence');
  }
});

test('reference orbits are deterministic and finite across the parameter range', () => {
  for (const system of Object.values(model.systems)) {
    const p = system.parameter;
    for (const value of [p.min, p.value, p.max]) {
      const first = model.createReference(system, value);
      const second = model.createReference(system, value);
      assert.deepEqual(first.start, second.start);
      assert.deepEqual(first.points, second.points);
      assert.ok(first.points.length > 1000);
      assert.ok(first.points.every(Number.isFinite));
      close(first.warmupTime, system.warmupSteps * system.dt, 1e-12);
    }
  }
});

test('every available slider position produces a finite reference orbit', () => {
  let count = 0;
  for (const system of Object.values(model.systems)) {
    const p = system.parameter;
    const intervals = Math.round((p.max - p.min) / p.step);
    for (let i = 0; i <= intervals; i++) {
      const value = Number((p.min + i * p.step).toFixed(p.digits));
      const reference = model.createReference(system, value);
      assert.ok(reference.start.every(Number.isFinite), system.name + ' at ' + value);
      count++;
    }
  }
  assert.equal(count, 813);
});

test('the live base follows the same integration as the reference orbit', () => {
  for (const system of Object.values(model.systems)) {
    const reference = model.createReference(system, system.parameter.value);
    const sim = new model.Simulation(system, system.parameter.value, 1e-5, reference.start);
    const sample = 45;
    for (let i = 0; i < sample * system.sampleEvery; i++) assert.equal(sim.step(), true);
    for (let axis = 0; axis < 3; axis++) close(sim.base[axis], reference.points[sample * 3 + axis], 1e-12);
    assert.notDeepEqual(sim.base, sim.twin);
  }
});

test('renormalized probe recovers the growth rate for a linear system', () => {
  const sim = new model.Simulation(linear, 0, 1e-4, [1, 2, -1]);
  assert.equal(sim.growthEstimate(), null);
  for (let i = 0; i < 1000; i++) assert.equal(sim.step(), true);
  close(sim.time(), 10, 1e-12);
  close(sim.growthEstimate(), 0.4, 2e-7);
  close(sim.separation(), 1e-4 * Math.exp(4), 1e-9);
});

test('classic Lorenz has sustained positive growth; rho=15 settles locally', () => {
  const system = model.systems.lorenz;
  const chaotic = model.createReference(system, 28);
  const a = new model.Simulation(system, 28, 1e-5, chaotic.start);
  for (let i = 0; i < Math.round(200 / system.dt); i++) assert.equal(a.step(), true);
  assert.ok(a.growthEstimate() > 0.75 && a.growthEstimate() < 1.05, 'long-run Lorenz estimate should be near 0.9');
  assert.ok(a.separation() > 0.1, 'the unrescaled visible pair separates');

  const stable = model.createReference(system, 15);
  const b = new model.Simulation(system, 15, 1e-5, stable.start);
  for (let i = 0; i < Math.round(80 / system.dt); i++) assert.equal(b.step(), true);
  assert.ok(b.growthEstimate() < 0, 'the probe contracts near the stable equilibrium');
  assert.ok(b.separation() < 1e-7, 'the visible pair converges locally');
});

test('parameter clamping handles invalid input', () => {
  const s = model.systems.lorenz;
  assert.equal(model.clampParameter(s, -9), 0);
  assert.equal(model.clampParameter(s, 99), 50);
  assert.equal(model.clampParameter(s, NaN), 28);
});
