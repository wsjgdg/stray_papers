'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../rigid-model.js');

function evolve(sim, seconds, visit) {
  for (let i = 0; i < Math.round(seconds / M.DT); i++) {
    assert.equal(sim.step(), true);
    if (visit) visit(sim);
  }
}
function close(a, b, tolerance, message) { assert.ok(Math.abs(a - b) <= tolerance, `${message || 'values differ'}: ${a} vs ${b}`); }

test('rectangular-body dimensions reproduce all three moments and reject impossible triples', () => {
  for (const inertia of [[1, 2, 2.6], [1, 1, 1], [.5, 2, 2.4], [2.9, 1.6, 1.5]]) {
    assert.equal(M.validInertia(inertia), true);
    const [a, b, c] = M.boxDimensions(inertia, 1);
    [((b * b + c * c) / 12), ((a * a + c * c) / 12), ((a * a + b * b) / 12)].forEach((v, i) => close(v, inertia[i], 1e-12));
  }
  for (const moments of [[1, 1, 3], [1, 1, 2], [0, 1, 1], [NaN, 1, 1], [-1, 1, 1]]) {
    assert.equal(M.validInertia(moments), false);
    assert.throws(() => new M.FreeBody(moments, [0, 1, 0]));
  }
});

test('principal-axis rotations and the quaternion rotation agree with the analytical solution', () => {
  const sim = new M.FreeBody([1, 2, 2.6], [0, 0, 2], [0, 0, 0, 1]);
  evolve(sim, 2);
  const expected = M.axisAngle([0, 0, 1], 4);
  const actual = sim.orientation();
  actual.forEach((v, i) => close(v, expected[i], 1e-10));
  const v = M.rotate(actual, [1, 0, 0]);
  close(v[0], Math.cos(4), 1e-10); close(v[1], Math.sin(4), 1e-10); close(v[2], 0, 1e-12);
  assert.deepEqual(sim.omega(), [0, 0, 2]);
});

test('energy and all components of inertial-frame angular momentum stay constant', () => {
  const q = M.normalizeQuaternion([0.1, -0.27, 0.33, 0.9]);
  const sim = new M.FreeBody([1, 2, 2.6], [1.2, 3.1, -0.8], q), initial = sim.worldMomentum(), initialEnergy = sim.energy();
  evolve(sim, 120);
  close(sim.energy(), initialEnergy, 1e-7, 'energy drift');
  sim.worldMomentum().forEach((v, i) => close(v, initial[i], 1e-7, 'world angular momentum drift'));
  close(Math.hypot(...sim.orientation()), 1, 1e-12, 'unit quaternion');
});

test('a slightly perturbed intermediate-axis spin flips while the extreme-axis spins remain near their axes', () => {
  const inertia = [1, 2, 2.6], ordered = M.orderedAxes(inertia).order;
  const middle = new M.FreeBody(inertia, M.presetOmega(inertia, 'middle'), [0, 0, 0, 1]);
  let minAlignment = 1, maxAlignment = -1;
  evolve(middle, 15, sim => {
    minAlignment = Math.min(minAlignment, sim.axisAlignment(ordered[1]));
    maxAlignment = Math.max(maxAlignment, sim.axisAlignment(ordered[1]));
  });
  assert.ok(minAlignment < -0.9 && maxAlignment > 0.9, `expected reversals, got ${minAlignment}, ${maxAlignment}`);
  for (const [role, axis] of [['small', ordered[0]], ['large', ordered[2]]]) {
    const sim = new M.FreeBody(inertia, M.presetOmega(inertia, role), [0, 0, 0, 1]);
    let lowest = 1;
    evolve(sim, 15, body => { lowest = Math.min(lowest, body.axisAlignment(axis)); });
    assert.ok(lowest > 0.95, `${role} axis should remain near the angular momentum vector`);
  }
});

test('an exactly aligned intermediate-axis spin does not spontaneously acquire a perturbation', () => {
  const sim = new M.FreeBody([1, 2, 2.6], [0, 3, 0]);
  evolve(sim, 10);
  assert.deepEqual(sim.omega(), [0, 3, 0]);
  close(sim.axisAlignment(1), 1, 1e-12);
  assert.equal(M.orderedAxes([1, 1, 1.5]).distinct, false);
});

test('preset construction works for reordered axes and zero angular momentum is handled', () => {
  const inertia = [2.4, 1.3, 2], sorted = M.orderedAxes(inertia);
  assert.deepEqual(sorted.order, [1, 2, 0]);
  for (const [role, slot] of [['small', 0], ['middle', 1], ['large', 2]]) assert.equal(M.presetOmega(inertia, role)[sorted.order[slot]], 3.2);
  const rest = new M.FreeBody(inertia, [0, 0, 0]);
  evolve(rest, 1);
  assert.equal(rest.axisAlignment(0), null); assert.equal(rest.energy(), 0); assert.equal(rest.momentumError(), 0);
});

test('constant world-frame force through the center gives exact accelerated translation and no torque', () => {
  const inertia = [1, 2, 2.6], omega = [1.2, 3.1, -0.8], q = M.normalizeQuaternion([.1, -.27, .33, .9]);
  const options = { mass: 2, force: [1.4, -2, .6], point: [0, 0, 0], position: [.5, -1, .2], velocity: [.1, .3, -.2] };
  const forced = new M.FreeBody(inertia, omega, q, options), free = new M.FreeBody(inertia, omega, q);
  evolve(forced, 4); evolve(free, 4);
  const t = 4;
  forced.position().forEach((value, i) => close(value, options.position[i] + options.velocity[i] * t + options.force[i] * t * t / (2 * options.mass), 2e-10, 'position'));
  forced.velocity().forEach((value, i) => close(value, options.velocity[i] + options.force[i] * t / options.mass, 2e-10, 'velocity'));
  forced.orientation().forEach((value, i) => close(value, free.orientation()[i], 1e-11, 'center force does not turn the body'));
  forced.omega().forEach((value, i) => close(value, free.omega()[i], 1e-11));
  forced.worldTorque().forEach(value => close(value, 0, 1e-12));
  assert.ok(forced.momentumError() < 1e-7);
  assert.ok(Math.abs(forced.mechanicalEnergyError()) < 1e-7);
  assert.ok(forced.linearMomentumError() < 1e-9);
});

test('an offset force produces the correct world and body torque for a rotated body', () => {
  const q = M.axisAngle([0, 0, 1], Math.PI / 2), sim = new M.FreeBody([1, 2, 2.6], [0, 0, 0], q,
    { force: [1, 0, 0], point: [1, 0, 0] });
  sim.worldTorque().forEach((value, i) => close(value, [0, 0, -1][i], 1e-12));
  sim.bodyTorque().forEach((value, i) => close(value, [0, 0, -1][i], 1e-12));
  sim.step();
  close(sim.omega()[2], -M.DT / 2.6, 2e-8, 'Euler equation includes applied torque');
  close(sim.position()[0], .5 * M.DT ** 2, 1e-12, 'Newton equation includes the same force');
});

test('off-center forcing respects Newton–Euler impulse and constant-force mechanical energy', () => {
  const inertia = [1, 2, 2.6], q = M.normalizeQuaternion([.1, -.27, .33, .9]);
  const sim = new M.FreeBody(inertia, [1.2, 3.1, -.8], q,
    { force: [.4, -.8, 1.3], point: [M.boxDimensions(inertia, 1)[0] / 2, 0, 0] });
  const initialL = sim.worldMomentum(), torqueIntegral = [0, 0, 0];
  let previous = sim.worldTorque();
  evolve(sim, 12, body => {
    const next = body.worldTorque();
    for (let i = 0; i < 3; i++) torqueIntegral[i] += (previous[i] + next[i]) * M.DT / 2;
    previous = next;
  });
  assert.ok(sim.momentumError() > .05, 'a nonzero torque changes angular momentum');
  sim.worldMomentum().forEach((value, i) => close(value - initialL[i], torqueIntegral[i], 2e-4, 'angular impulse'));
  assert.ok(Math.abs(sim.mechanicalEnergyError()) < 1e-6, `mechanical energy: ${sim.mechanicalEnergyError()}`);
  assert.ok(sim.linearMomentumError() < 1e-9, `linear impulse: ${sim.linearMomentumError()}`);
});

test('force angles are defined in the fixed world frame and invalid external parameters are rejected', () => {
  const x = M.forceFromAngles(2, 0, 0), z = M.forceFromAngles(2, 90, 0), up = M.forceFromAngles(2, -35, 90), negative = M.forceFromAngles(2, -90, -30);
  x.forEach((value, i) => close(value, [2, 0, 0][i], 1e-12));
  z.forEach((value, i) => close(value, [0, 0, 2][i], 1e-12));
  up.forEach((value, i) => close(value, [0, 2, 0][i], 1e-12));
  negative.forEach((value, i) => close(value, [0, -1, -Math.sqrt(3)][i], 1e-12));
  assert.deepEqual(M.forceFromAngles(2, 13, 90), [0, 2, 0]);
  assert.deepEqual(M.forceFromAngles(2, -175, -90), [0, -2, 0]);
  assert.deepEqual(M.forceFromAngles(2, -180, 0), M.forceFromAngles(2, 180, 0));
  assert.ok(M.forceFromAngles(1e-12, 45, 0)[0] > 0, 'genuinely small forces are retained');
  const pole = new M.FreeBody([1, 2, 2.6], [0, 0, 0], null, { force: M.forceFromAngles(2, 0, 90) });
  evolve(pole, .5);
  assert.equal(pole.setForce(M.forceFromAngles(2, 85, 90)), false, 'azimuth at the pole must not start a new force segment');
  close(pole.segmentTime(), .5, 1e-12);
  assert.throws(() => M.forceFromAngles(-1, 0, 0));
  assert.throws(() => new M.FreeBody([1, 2, 2.6], [0, 1, 0], null, { force: [NaN, 0, 0] }));
  assert.throws(() => new M.FreeBody([1, 2, 2.6], [0, 1, 0], null, { mass: 0 }));
});

test('forced trajectories remain finite and accurate at inertia, spin and force extremes', () => {
  const cases = [
    [[.5, 2.5, 2.9], [4, -4, 4]],
    [[.5, .55, 1], [4, 4, 4]],
    [[3, 1.55, 1.5], [-4, 4, -4]],
    [[3, 3, 3], [4, 4, 4]]
  ];
  for (const [inertia, omega] of cases) for (const azimuth of [0, 90, 180]) {
    const force = M.forceFromAngles(3, azimuth, 45), point = [M.boxDimensions(inertia, 1)[0] / 2, 0, 0];
    const sim = new M.FreeBody(inertia, omega, null, { force, point });
    evolve(sim, 30);
    assert.ok(Math.abs(sim.mechanicalEnergyError()) / Math.max(1, Math.abs(sim.initialMechanicalEnergy)) < 1e-6);
    assert.ok(sim.linearMomentumError() < 1e-8);
    close(Math.hypot(...sim.orientation()), 1, 1e-12);
  }
});

test('changing a center force preserves motion and diagnostics follow each constant-force segment', () => {
  const sim = new M.FreeBody([1, 2, 2.6], [.1, 3.2, .15], null, { mass: 2, force: [2, 0, 0] });
  evolve(sim, 2);
  const before = { position: sim.position(), velocity: sim.velocity(), omega: sim.omega(), q: sim.orientation(), time: sim.time(), initialEnergy: sim.initialEnergy };
  assert.equal(sim.setForce([0, 2, 0], [0, 0, 0]), true);
  assert.deepEqual(sim.position(), before.position); assert.deepEqual(sim.velocity(), before.velocity);
  assert.deepEqual(sim.omega(), before.omega); assert.deepEqual(sim.orientation(), before.q); assert.equal(sim.time(), before.time);
  assert.equal(sim.initialEnergy, before.initialEnergy, 'experiment initial values are preserved');
  assert.equal(sim.segmentTime(), 0);
  assert.equal(sim.segment.startStep, 2 / M.DT);
  evolve(sim, 1);
  sim.position().forEach((value, i) => close(value, before.position[i] + before.velocity[i] + [0, .5, 0][i], 1e-10, 'position after changing force'));
  sim.velocity().forEach((value, i) => close(value, before.velocity[i] + [0, 1, 0][i], 1e-10, 'velocity after changing force'));
  close(sim.segmentTime(), 1, 1e-12);
  assert.ok(Math.abs(sim.mechanicalEnergyError()) < 1e-7);
  assert.ok(sim.linearMomentumError() < 1e-9);
  const coast = { position: sim.position(), velocity: sim.velocity(), omega: sim.omega(), q: sim.orientation() };
  assert.equal(sim.setForce([0, 0, 0]), true);
  assert.deepEqual(sim.position(), coast.position); assert.deepEqual(sim.velocity(), coast.velocity);
  assert.equal(sim.setForce([0, 0, 0]), false, 'unchanged controls do not erase the diagnostic segment');
  evolve(sim, 1.5);
  sim.position().forEach((value, i) => close(value, coast.position[i] + coast.velocity[i] * 1.5, 1e-10, 'coasting position'));
  sim.velocity().forEach((value, i) => close(value, coast.velocity[i], 1e-12, 'coasting velocity'));
  assert.ok(Math.abs(sim.energyError()) < 1e-7 && sim.momentumError() < 1e-7, 'free-rotation invariants use the coasting segment');
  assert.ok(sim.linearMomentumError() < 1e-9);
});

test('offset force and application-point changes preserve state and rebase potential diagnostics transactionally', () => {
  const inertia = [1, 2, 2.6], point = [M.boxDimensions(inertia, 1)[0] / 2, 0, 0];
  const sim = new M.FreeBody(inertia, [1, 2, -.7], M.axisAngle([0, 1, 0], .6), { force: [1, -.5, .8], point });
  evolve(sim, 3);
  const before = Array.from(sim.state), time = sim.time(), initial = sim.initialMechanicalEnergy;
  assert.throws(() => sim.setForce([0, NaN, 1], [0, 0, 0]));
  assert.throws(() => sim.setForce([0, 0, 1], [0, Infinity, 0]));
  assert.deepEqual(Array.from(sim.state), before); assert.deepEqual(sim.force, [1, -.5, .8]);
  assert.equal(sim.time(), time); assert.equal(sim.segment.startStep, 0);
  assert.equal(sim.setForce([-.7, .8, 1.1], [0, 0, 0]), true);
  assert.deepEqual(Array.from(sim.state), before); assert.equal(sim.time(), time);
  assert.equal(sim.initialMechanicalEnergy, initial);
  assert.equal(sim.worldTorque().reduce((sum, x) => sum + Math.abs(x), 0), 0);
  evolve(sim, 2);
  assert.ok(Math.abs(sim.mechanicalEnergyError()) < 1e-7 && sim.linearMomentumError() < 1e-9);
  sim.setForce([-.7, .8, 1.1], point);
  assert.ok(Math.hypot(...sim.worldTorque()) > .1);
  evolve(sim, 7);
  assert.ok(Math.abs(sim.mechanicalEnergyError()) < 1e-6 && sim.linearMomentumError() < 1e-9);
});

test('force–velocity angle is a world-frame measurement and is undefined for zero vectors', () => {
  const inertia = [1, 2, 2.6];
  const sim = new M.FreeBody(inertia, [.1, 3.2, .15], M.axisAngle([1, 1, 1], .7),
    { force: [0, 1.5, 0], point: [0, 0, 0], velocity: [1.5, 0, 0] });
  close(sim.forceVelocityAngle(), 90, 1e-12, 'perpendicular force and velocity');
  evolve(sim, 1);
  close(sim.forceVelocityAngle(), 45, 1e-10, 'acceleration bends the velocity continuously');
  const v = sim.velocity();
  sim.setForce(v, [0, 0, 0]); close(sim.forceVelocityAngle(), 0, 1e-6, 'parallel');
  sim.setForce(v.map(value => -value), [0, 0, 0]); close(sim.forceVelocityAngle(), 180, 1e-6, 'antiparallel');
  sim.setForce([0, 0, 0]); assert.equal(sim.forceVelocityAngle(), null);
  const rest = new M.FreeBody(inertia, [0, 0, 0], null, { force: [1, 0, 0] });
  assert.equal(rest.forceVelocityAngle(), null, 'zero speed has no direction');
  const tiny = new M.FreeBody(inertia, [0, 0, 0], null, { force: [1, 0, 0], velocity: [1e-11, 0, 0] });
  assert.equal(tiny.forceVelocityAngle(), null, 'the readout treats tiny magnitudes as undefined');
  const tinyForce = new M.FreeBody(inertia, [0, 0, 0], null, { force: [1e-11, 0, 0], velocity: [1, 0, 0] });
  assert.equal(tinyForce.forceVelocityAngle(), null);
  tinyForce.setForce([1e-10, 0, 0]); assert.equal(tinyForce.forceVelocityAngle(), null, 'the threshold itself is treated consistently');
  tinyForce.setForce([1e-8, 0, 0]); close(tinyForce.forceVelocityAngle(), 0, 1e-9);
});

test('turning force after one second preserves velocity and produces the analytical bent trajectory', () => {
  const sim = new M.FreeBody([1, 2, 2.6], [.1, 3.2, .15], null, { force: [1.5, 0, 0], point: [0, 0, 0] });
  evolve(sim, 1);
  close(sim.position()[0], .75, 1e-12); close(sim.velocity()[0], 1.5, 1e-12);
  sim.setForce([0, 1.5, 0]);
  close(sim.forceVelocityAngle(), 90, 1e-12);
  evolve(sim, 1);
  [2.25, .75, 0].forEach((value, i) => close(sim.position()[i], value, 1e-10));
  [1.5, 1.5, 0].forEach((value, i) => close(sim.velocity()[i], value, 1e-10));
  close(sim.forceVelocityAngle(), 45, 1e-10);
  assert.ok(sim.linearMomentumError() < 1e-10 && Math.abs(sim.mechanicalEnergyError()) < 1e-7);
});
