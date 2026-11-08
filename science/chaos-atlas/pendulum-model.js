/* Ideal planar double pendulum. Shared by the 3D view and Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PendulumModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DT = 1 / 240;
  const RAD = Math.PI / 180;
  const DEFAULTS = Object.freeze({ angle1: 120, angle2: -10, gravity: 9.8, massRatio: 1, perturbation: 0.1 });
  const PRESETS = Object.freeze({
    butterfly: { angle1: 120, angle2: -10, gravity: 9.8, massRatio: 1, perturbation: 0.1 },
    gentle: { angle1: 18, angle2: 12, gravity: 9.8, massRatio: 1, perturbation: 0.1 },
    energetic: { angle1: 145, angle2: 115, gravity: 9.8, massRatio: 1, perturbation: 0.1 }
  });
  function clamp(v, min, max, fallback) {
    v = Number(v);
    return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  }
  function normalize(config) {
    config = config || {};
    return {
      angle1: clamp(config.angle1, -180, 180, DEFAULTS.angle1),
      angle2: clamp(config.angle2, -180, 180, DEFAULTS.angle2),
      gravity: clamp(config.gravity, 2, 15, DEFAULTS.gravity),
      massRatio: clamp(config.massRatio, 0.5, 2.5, DEFAULTS.massRatio),
      perturbation: clamp(config.perturbation, 0.01, 1, DEFAULTS.perturbation),
      length1: 1, length2: 1, mass1: 1
    };
  }
  // Absolute angles are measured from the downward vertical. Both rods are
  // massless and rigid; the masses are concentrated at their ends.
  function derivative(state, p) {
    const a = state[0], b = state[1], w1 = state[2], w2 = state[3];
    const l1 = p.length1, l2 = p.length2, m1 = p.mass1, m2 = p.massRatio * m1, g = p.gravity;
    const delta = a - b;
    const denom = 2 * m1 + m2 - m2 * Math.cos(2 * delta);
    const acc1 = (-g * (2 * m1 + m2) * Math.sin(a) - m2 * g * Math.sin(a - 2 * b)
      - 2 * Math.sin(delta) * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(delta))) / (l1 * denom);
    const acc2 = 2 * Math.sin(delta) * (w1 * w1 * l1 * (m1 + m2)
      + g * (m1 + m2) * Math.cos(a) + w2 * w2 * l2 * m2 * Math.cos(delta)) / (l2 * denom);
    return [w1, w2, acc1, acc2];
  }
  function rk4(state, p, dt) {
    const k1 = derivative(state, p);
    const tmp = (k, factor) => state.map((v, i) => v + factor * k[i]);
    const k2 = derivative(tmp(k1, dt / 2), p);
    const k3 = derivative(tmp(k2, dt / 2), p);
    const k4 = derivative(tmp(k3, dt), p);
    return state.map((v, i) => v + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
  }
  function positions(state, p) {
    const x1 = p.length1 * Math.sin(state[0]), y1 = -p.length1 * Math.cos(state[0]);
    return { x1: x1, y1: y1, x2: x1 + p.length2 * Math.sin(state[1]), y2: y1 - p.length2 * Math.cos(state[1]) };
  }
  function energy(state, p) {
    const a = state[0], b = state[1], w1 = state[2], w2 = state[3];
    const m1 = p.mass1, m2 = p.mass1 * p.massRatio, l1 = p.length1, l2 = p.length2;
    const kinetic = 0.5 * (m1 + m2) * l1 * l1 * w1 * w1 + 0.5 * m2 * l2 * l2 * w2 * w2
      + m2 * l1 * l2 * w1 * w2 * Math.cos(a - b);
    // Potential energy is zero when both masses hang at their lowest position.
    const potential = (m1 + m2) * p.gravity * l1 * (1 - Math.cos(a))
      + m2 * p.gravity * l2 * (1 - Math.cos(b));
    return { kinetic: kinetic, potential: potential, total: kinetic + potential };
  }
  function wrapAngle(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
  function Experiment(config) {
    this.params = normalize(config);
    const p = this.params;
    this.a = [p.angle1 * RAD, p.angle2 * RAD, 0, 0];
    this.b = [p.angle1 * RAD, (p.angle2 + p.perturbation) * RAD, 0, 0];
    this.initialEnergy = energy(this.a, p).total;
    this.steps = 0;
  }
  Experiment.prototype.step = function () {
    const a = rk4(this.a, this.params, DT), b = rk4(this.b, this.params, DT);
    if (!a.every(Number.isFinite) || !b.every(Number.isFinite)) return false;
    this.a = a; this.b = b; this.steps++;
    return true;
  };
  Experiment.prototype.time = function () { return this.steps * DT; };
  Experiment.prototype.separation = function () {
    const a = positions(this.a, this.params), b = positions(this.b, this.params);
    return Math.hypot(a.x2 - b.x2, a.y2 - b.y2);
  };
  Experiment.prototype.energy = function () { return energy(this.a, this.params); };
  Experiment.prototype.energyDrift = function () { return this.energy().total - this.initialEnergy; };
  return { DT: DT, RAD: RAD, DEFAULTS: DEFAULTS, PRESETS: PRESETS, normalize: normalize,
    derivative: derivative, rk4: rk4, positions: positions, energy: energy,
    wrapAngle: wrapAngle, Experiment: Experiment };
});
