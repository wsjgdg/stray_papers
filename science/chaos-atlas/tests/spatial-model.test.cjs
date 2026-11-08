'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../spatial-model.js');
const planar = require('../pendulum-model.js');

function close(actual, expected, tolerance, message = 'values differ') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}
function advance(sim, seconds) {
  for (let i = 0; i < Math.round(seconds / M.DT); i++) assert.equal(sim.step(), true, `step ${i}`);
}
function constraints(sim) {
  const n = sim.params.links.length, offset = 3 * n;
  for (const state of [sim.a, sim.b]) for (let i = 0; i < n; i++) {
    const j = 3 * i;
    close(Math.hypot(state[j], state[j + 1], state[j + 2]), 1, 1e-12, 'rod length');
    close(state[j] * state[offset + j] + state[j + 1] * state[offset + j + 1] + state[j + 2] * state[offset + j + 2], 0, 1e-10, 'tangential velocity');
  }
}

test('angles represent a full sphere and normalize without a fixed link-count limit', () => {
  for (const [theta, phi] of [[0, 0], [90, 0], [90, 90], [180, -90], [123, -157]]) {
    const d = M.direction(theta, phi), result = M.angles(d, phi);
    close(Math.hypot(...d), 1, 1e-14);
    close(result.theta, theta, 1e-10);
    if (theta !== 0 && theta !== 180) close(result.phi, phi, 1e-10);
  }
  const links = Array.from({ length: 1000 }, (_, i) => ({ theta: i % 181, phi: i % 361 - 180 }));
  const config = M.normalize({ links, gravity: 100, massRatio: 0.1, perturbation: 5 });
  assert.equal(config.links.length, 1000);
  assert.equal(config.gravity, 15); assert.equal(config.massRatio, 0.5); assert.equal(config.perturbation, 1);
  assert.equal(config.links[999].theta, 999 % 181);
});

test('a single spherical pendulum can follow a genuinely three-dimensional conical orbit', () => {
  const theta = 30 * M.RAD, gravity = 9.8;
  const sim = new M.Experiment({ links: [{ theta: 30, phi: 0 }], gravity });
  const angularSpeed = Math.sqrt(gravity / Math.cos(theta));
  // The initial tangential velocity produces an exact ideal conical pendulum.
  sim.a[3] = 0; sim.a[4] = 0; sim.a[5] = Math.sin(theta) * angularSpeed;
  const initialEnergy = sim.energy().total;
  advance(sim, 3);
  const expectedPhi = angularSpeed * sim.time();
  close(sim.a[0], Math.sin(theta) * Math.cos(expectedPhi), 2e-7, 'x');
  close(sim.a[1], -Math.cos(theta), 2e-7, 'y');
  close(sim.a[2], Math.sin(theta) * Math.sin(expectedPhi), 2e-7, 'z');
  close(sim.energy().total, initialEnergy, 1e-7, 'conical energy');
  constraints(sim);
});

test('the spatial equations agree with the original planar double pendulum', () => {
  for (const [name, links] of Object.entries({
    butterfly: [{ theta: 120, phi: 0 }, { theta: 10, phi: 180 }],
    gentle: [{ theta: 18, phi: 0 }, { theta: 12, phi: 0 }],
    energetic: [{ theta: 145, phi: 0 }, { theta: 115, phi: 0 }]
  })) {
    const spatial = new M.Experiment({ links }), original = new planar.Experiment(planar.PRESETS[name]);
    advance(spatial, 1); advance(original, 1);
    const p = M.positions(spatial.a, spatial.params), q = planar.positions(original.a, original.params);
    close(p[0], q.x1, 1e-6, name + ' x1'); close(p[1], q.y1, 1e-6, name + ' y1'); close(p[2], 0, 1e-12, name + ' z1');
    close(p[3], q.x2, 1e-6, name + ' x2'); close(p[4], q.y2, 1e-6, name + ' y2'); close(p[5], 0, 1e-12, name + ' z2');
    close(spatial.energy().total, original.energy().total, 1e-5, name + ' energy');
  }
});

test('non-coplanar initial orientations generate a non-planar endpoint trajectory', () => {
  const sim = new M.Experiment(M.PRESETS.butterfly), samples = [];
  for (const target of [0, 0.5, 1, 2]) {
    while (sim.time() + M.DT / 2 < target) assert.equal(sim.step(), true);
    samples.push(Array.from(M.positions(sim.a, sim.params).slice(-3)));
  }
  const [a, b, c, d] = samples, sub = p => p.map((x, i) => x - a[i]), u = sub(b), v = sub(c), w = sub(d);
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const triple = cross.reduce((sum, x, i) => sum + x * w[i], 0);
  assert.ok(Math.abs(triple) > 0.1, `four endpoint samples cannot lie in one plane: ${triple}`);
  constraints(sim);
});

test('twin perturbation has the requested 3D angle even for a link along z', () => {
  for (const link of [{ theta: 90, phi: 90 }, { theta: 0, phi: 0 }, { theta: 125, phi: -60 }]) {
    const sim = new M.Experiment({ links: [link], perturbation: 0.1 });
    close(sim.separation(), 2 * Math.sin(0.1 * M.RAD / 2), 1e-13);
    advance(sim, 2); constraints(sim);
  }
  const chaotic = new M.Experiment(M.PRESETS.butterfly);
  advance(chaotic, 10);
  assert.ok(chaotic.separation() > 0.2, 'the two actual spatial trajectories separate in this example');
});

test('many-body chains retain constraints and reasonable energy across parameter extremes', () => {
  for (const n of [1, 2, 5, 10, 25, 100]) for (const [gravity, massRatio] of [[9.8, 1], [15, 2.5], [2, 0.5]]) {
    const links = Array.from({ length: n }, (_, i) => ({ theta: [35, 100, 65, 125, 40][i % 5], phi: [-45, 80, 10, -105, 140][i % 5] }));
    const sim = new M.Experiment({ links, gravity, massRatio });
    advance(sim, 5); constraints(sim);
    const relativeDrift = Math.abs(sim.energyDrift()) / Math.max(1, sim.initialEnergy);
    assert.ok(relativeDrift < 0.002, `N=${n}, g=${gravity}, ratio=${massRatio}, drift=${relativeDrift}`);
    assert.ok(sim.a.every(Number.isFinite) && sim.b.every(Number.isFinite));
  }
});

test('downward rest state and low-energy pendulum have the expected energy', () => {
  const sim = new M.Experiment({ links: [{ theta: 0, phi: 0 }, { theta: 0, phi: 0 }, { theta: 0, phi: 0 }] });
  assert.deepEqual(sim.energy(), { kinetic: 0, potential: 0, total: 0 });
  advance(sim, 5);
  close(sim.energy().total, 0, 0);
  assert.deepEqual(Array.from(M.positions(sim.a, sim.params)), [0, -1, 0, 0, -2, 0, 0, -3, 0]);
});
