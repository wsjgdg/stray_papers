'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../pendulum-model.js');

function close(actual, expected, tolerance, message = 'values differ') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}
function advance(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / M.DT); i++) assert.equal(sim.step(), true);
}

test('normalization agrees with the control limits, including both vertical endpoints', () => {
  const low = M.normalize({ angle1: -180, angle2: -180, gravity: -1, massRatio: -1, perturbation: 0 });
  const high = M.normalize({ angle1: 180, angle2: 180, gravity: 100, massRatio: 100, perturbation: 9 });
  assert.deepEqual([low.angle1, low.angle2, low.gravity, low.massRatio, low.perturbation], [-180, -180, 2, 0.5, 0.01]);
  assert.deepEqual([high.angle1, high.angle2, high.gravity, high.massRatio, high.perturbation], [180, 180, 15, 2.5, 1]);
  assert.deepEqual(M.normalize({ angle1: NaN, gravity: Infinity, massRatio: undefined }), M.normalize());
  assert.deepEqual([low.length1, low.length2, low.mass1], [1, 1, 1]);
});

test('rod geometry uses absolute angles from down and keeps both lengths fixed', () => {
  const p = M.normalize();
  assert.deepEqual(M.positions([0, 0, 0, 0], p), { x1: 0, y1: -1, x2: 0, y2: -2 });
  const horizontal = M.positions([Math.PI / 2, -Math.PI / 2, 0, 0], p);
  close(horizontal.x1, 1, 1e-14); close(horizontal.y1, 0, 1e-14);
  close(horizontal.x2, 0, 1e-14); close(horizontal.y2, 0, 1e-14);
  for (const state of [[0.7, 2.9], [-Math.PI, Math.PI], [10, -20]]) {
    const q = M.positions(state, p);
    close(Math.hypot(q.x1, q.y1), 1, 1e-14, 'first rod');
    close(Math.hypot(q.x2 - q.x1, q.y2 - q.y1), 1, 1e-14, 'second rod');
  }
});

test('energy has the documented zero and is conserved by the continuous equations', () => {
  const p = M.normalize();
  assert.deepEqual(M.energy([0, 0, 0, 0], p), { kinetic: 0, potential: 0, total: 0 });
  close(M.energy([0, 0, 1, 2], p).kinetic, 5, 1e-14);
  close(M.energy([Math.PI, Math.PI, 0, 0], p).potential, 6 * p.gravity, 1e-12);
  M.derivative([0, 0, 0, 0], p).forEach(value => close(value, 0, 0, 'downward equilibrium'));
  for (const params of [p, M.normalize({ gravity: 15, massRatio: 2.5 }), M.normalize({ gravity: 2, massRatio: 0.5 })]) {
    const state = [1.1, -0.6, 0.3, 0.5], velocity = M.derivative(state, params), h = 1e-6;
    const plus = M.energy(state.map((v, i) => v + h * velocity[i]), params).total;
    const minus = M.energy(state.map((v, i) => v - h * velocity[i]), params).total;
    close((plus - minus) / (2 * h), 0, 2e-7, 'dE/dt');
  }
});

test('RK4 converges at fourth order on a nonlinear double-pendulum trajectory', () => {
  const p = M.normalize();
  function solve(dt) {
    let state = [1.1, -0.6, 0.3, 0.5];
    for (let i = 0; i < Math.round(1 / dt); i++) state = M.rk4(state, p, dt);
    return state;
  }
  const reference = solve(1 / 8192), error = dt => Math.hypot(...solve(dt).map((v, i) => v - reference[i]));
  const coarse = error(1 / 30), medium = error(1 / 60), fine = error(1 / 120);
  assert.ok(coarse / medium > 10, `coarse/medium = ${coarse / medium}`);
  assert.ok(medium / fine > 10, `medium/fine = ${medium / fine}`);
});

test('each preset evolves deterministically with small energy drift', () => {
  for (const [name, config] of Object.entries(M.PRESETS)) {
    const first = new M.Experiment(config), second = new M.Experiment(config);
    advance(first, 10); advance(second, 10);
    assert.deepEqual(first.a, second.a, name);
    assert.deepEqual(first.b, second.b, name);
    close(first.time(), 10, 1e-12);
    assert.ok(Math.abs(first.energyDrift()) / first.initialEnergy < 1e-5, `${name} energy drift`);
    assert.ok(first.a.every(Number.isFinite) && first.b.every(Number.isFinite), name);
  }
});

test('tiny angular perturbations are real twin trajectories, not a visual offset', () => {
  const chaotic = new M.Experiment(M.PRESETS.butterfly);
  close(chaotic.separation(), 2 * Math.sin(0.1 * M.RAD / 2), 1e-14);
  const gentle = new M.Experiment(M.PRESETS.gentle);
  advance(chaotic, 10); advance(gentle, 10);
  assert.ok(chaotic.separation() > 0.5, 'the butterfly preset separates substantially');
  assert.ok(gentle.separation() < 0.005, 'the small-angle preset stays close in this finite interval');
  assert.ok(chaotic.separation() <= 4, 'two endpoints of two 1 m rods cannot be over 4 m apart');
});

test('extreme angle, gravity, mass and perturbation combinations remain finite', () => {
  let combinations = 0;
  for (const angle1 of [-180, -90, 0, 90, 180]) for (const angle2 of [-180, -90, 0, 90, 180]) {
    for (const gravity of [2, 15]) for (const massRatio of [0.5, 2.5]) for (const perturbation of [0.01, 1]) {
      const sim = new M.Experiment({ angle1, angle2, gravity, massRatio, perturbation });
      const twinEnergy = M.energy(sim.b, sim.params).total;
      advance(sim, 5);
      const driftA = Math.abs(sim.energyDrift()) / Math.max(1, sim.initialEnergy);
      const driftB = Math.abs(M.energy(sim.b, sim.params).total - twinEnergy) / Math.max(1, twinEnergy);
      assert.ok(sim.a.every(Number.isFinite) && sim.b.every(Number.isFinite), JSON.stringify(sim.params));
      assert.ok(driftA < 1e-4 && driftB < 1e-4, `energy drift at ${JSON.stringify(sim.params)}`);
      assert.ok(sim.separation() <= 4 + 1e-12);
      combinations++;
    }
  }
  assert.equal(combinations, 200);
});

test('phase angles wrap without changing the physical configuration', () => {
  for (const value of [-20, -Math.PI, -0.2, 0, Math.PI, 27]) {
    const wrapped = M.wrapAngle(value);
    assert.ok(wrapped >= -Math.PI && wrapped <= Math.PI);
    close(Math.sin(wrapped), Math.sin(value), 1e-14);
    close(Math.cos(wrapped), Math.cos(value), 1e-14);
  }
});
