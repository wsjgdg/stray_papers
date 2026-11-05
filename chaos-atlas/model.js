/* The numerical model is shared by the browser and the Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChaosModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIGMA = 10;
  const BETA = 8 / 3;
  const ROSSLER_A = 0.2;
  const ROSSLER_B = 0.2;
  const LORENZ_HOPF = SIGMA * (SIGMA + BETA + 3) / (SIGMA - BETA - 1);

  const systems = {
    lorenz: {
      id: 'lorenz', name: 'Lorenz', subtitle: 'The butterfly', year: '1963',
      description: 'A simplified convection model whose stretching and folding produces the iconic butterfly.',
      parameter: { symbol: 'ρ', name: 'Driving force', min: 0, max: 50, step: 0.1, value: 28, digits: 1,
        help: 'Controls the strength of convection. Changing it restarts the experiment.' },
      constants: 'σ = 10  ·  β = 8/3  ·  ρ is adjustable',
      equations: ['ẋ = σ(y − x)', 'ẏ = x(ρ − z) − y', 'ż = xy − βz'],
      initial: [0.1, 0, 0], dt: 0.008, warmupSteps: 2000, referenceSteps: 10000, sampleEvery: 1,
      simulationRate: 1.6,
      view: { center: [0, 0, 25], extent: 30 },
      derivative: function (p, rho) {
        const x = p[0], y = p[1], z = p[2];
        return [SIGMA * (y - x), x * (rho - z) - y, x * y - BETA * z];
      },
      divergence: function () { return -SIGMA - 1 - BETA; },
      divergenceFormula: '∇ · f = −σ − 1 − β',
      regime: function (rho) {
        if (rho < 1) return { label: 'One locally stable equilibrium', detail: 'For ρ < 1, the origin is locally stable.' };
        if (Math.abs(rho - 1) < 1e-9) return { label: 'Stability boundary', detail: 'At ρ = 1, the origin changes stability and two equilibria appear.' };
        if (rho < LORENZ_HOPF) return { label: 'Two locally stable equilibria', detail: 'For 1 < ρ < 24.74, the two nonzero equilibria are locally stable.' };
        return { label: 'Nonzero equilibria unstable', detail: 'Above ρ ≈ 24.74, those equilibria are unstable. This alone does not prove chaos.' };
      }
    },
    rossler: {
      id: 'rossler', name: 'Rössler', subtitle: 'The spiral', year: '1976',
      description: 'A slow outward spiral folds back on itself, making a deceptively simple ribbon.',
      parameter: { symbol: 'c', name: 'Folding parameter', min: 2, max: 8, step: 0.1, value: 5.7, digits: 1,
        help: 'Changes the z feedback and the way the spiral folds. The path restarts.' },
      constants: 'a = 0.2  ·  b = 0.2  ·  c is adjustable',
      equations: ['ẋ = −y − z', 'ẏ = x + ay', 'ż = b + z(x − c)'],
      initial: [1, 1, 1], dt: 0.03, warmupSteps: 3000, referenceSteps: 16000, sampleEvery: 1,
      simulationRate: 5,
      view: { center: [0, 0, 7], extent: 14 },
      derivative: function (p, c) {
        const x = p[0], y = p[1], z = p[2];
        return [-y - z, x + ROSSLER_A * y, ROSSLER_B + z * (x - c)];
      },
      divergence: function (p, c) { return ROSSLER_A + p[0] - c; },
      divergenceFormula: '∇ · f = a + x − c',
      regime: function () {
        return { label: 'Stretch, then fold', detail: 'The local volume change varies with x; c changes the z feedback.' };
      }
    },
    thomas: {
      id: 'thomas', name: 'Thomas', subtitle: 'The labyrinth', year: '1999',
      description: 'Three cyclic sine couplings weave a maze of loops with no preferred axis.',
      parameter: { symbol: 'b', name: 'Damping', min: 0.1, max: 0.35, step: 0.001, value: 0.208, digits: 3,
        help: 'Sets the linear damping on all three coordinates. The path restarts.' },
      constants: 'b is adjustable  ·  cyclic sine feedback',
      equations: ['ẋ = sin(y) − bx', 'ẏ = sin(z) − by', 'ż = sin(x) − bz'],
      initial: [0.1, 0, 0], dt: 0.05, warmupSteps: 1600, referenceSteps: 20000, sampleEvery: 2,
      simulationRate: 6,
      view: { center: [0, 0, 0], extent: 6 },
      derivative: function (p, b) {
        const x = p[0], y = p[1], z = p[2];
        return [Math.sin(y) - b * x, Math.sin(z) - b * y, Math.sin(x) - b * z];
      },
      divergence: function (_p, b) { return -3 * b; },
      divergenceFormula: '∇ · f = −3b',
      regime: function () {
        return { label: 'Cyclic feedback', detail: 'Each coordinate feeds the next; damping contracts phase-space volume.' };
      }
    }
  };

  function clampParameter(system, value) {
    const p = system.parameter;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(p.max, Math.max(p.min, number)) : p.value;
  }

  // Classical fourth-order Runge–Kutta. The same fixed step is used for the
  // reference orbit, both visible trajectories, and the renormalized probe.
  function rk4Step(system, point, dt, parameter) {
    const f = system.derivative;
    const k1 = f(point, parameter);
    const k2 = f([point[0] + dt * k1[0] / 2, point[1] + dt * k1[1] / 2, point[2] + dt * k1[2] / 2], parameter);
    const k3 = f([point[0] + dt * k2[0] / 2, point[1] + dt * k2[1] / 2, point[2] + dt * k2[2] / 2], parameter);
    const k4 = f([point[0] + dt * k3[0], point[1] + dt * k3[1], point[2] + dt * k3[2]], parameter);
    return [
      point[0] + dt * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6,
      point[1] + dt * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6,
      point[2] + dt * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) / 6
    ];
  }

  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  function finite(point) { return point.every(Number.isFinite); }

  // A faint, precomputed reference orbit gives context from the first frame.
  // The bright live pair begins at its first point, after the stated warm-up.
  function createReference(system, value) {
    const parameter = clampParameter(system, value);
    let point = system.initial.slice();
    for (let i = 0; i < system.warmupSteps; i++) {
      point = rk4Step(system, point, system.dt, parameter);
      if (!finite(point)) throw new Error('The reference orbit became non-finite.');
    }
    const start = point.slice();
    const count = Math.floor(system.referenceSteps / system.sampleEvery) + 1;
    const points = new Float64Array(count * 3);
    points.set(point, 0);
    let n = 1;
    for (let i = 1; i <= system.referenceSteps; i++) {
      point = rk4Step(system, point, system.dt, parameter);
      if (!finite(point)) throw new Error('The reference orbit became non-finite.');
      if (i % system.sampleEvery === 0) {
        points.set(point, n * 3);
        n++;
      }
    }
    return { start: start, points: points, warmupTime: system.warmupSteps * system.dt, duration: system.referenceSteps * system.dt };
  }

  function Simulation(system, value, epsilon, start) {
    this.system = system;
    this.parameter = clampParameter(system, value);
    this.epsilon = epsilon;
    this.base = start.slice();
    this.twin = [start[0] + epsilon, start[1], start[2]];
    // This third trajectory is NOT the visible twin: rescaling it keeps the
    // perturbation small enough to estimate finite-time exponential growth.
    this.probeDistance = 1e-6;
    this.probe = [start[0] + this.probeDistance, start[1], start[2]];
    this.steps = 0;
    this.renormalizeEvery = Math.max(1, Math.round(0.5 / system.dt));
    this.logGrowth = 0;
    this.measurementTime = 0;
    this.probeValid = true;
  }

  Simulation.prototype.step = function () {
    const system = this.system, dt = system.dt, parameter = this.parameter;
    this.base = rk4Step(system, this.base, dt, parameter);
    this.twin = rk4Step(system, this.twin, dt, parameter);
    if (this.probeValid) this.probe = rk4Step(system, this.probe, dt, parameter);
    this.steps++;
    if (!finite(this.base) || !finite(this.twin)) return false;
    if (this.probeValid && this.steps % this.renormalizeEvery === 0) {
      const delta = distance(this.base, this.probe);
      if (!Number.isFinite(delta) || delta < 1e-14) {
        this.probeValid = false;
      } else {
        this.logGrowth += Math.log(delta / this.probeDistance);
        this.measurementTime += this.renormalizeEvery * dt;
        const ratio = this.probeDistance / delta;
        this.probe = [
          this.base[0] + (this.probe[0] - this.base[0]) * ratio,
          this.base[1] + (this.probe[1] - this.base[1]) * ratio,
          this.base[2] + (this.probe[2] - this.base[2]) * ratio
        ];
      }
    }
    return true;
  };
  Simulation.prototype.time = function () { return this.steps * this.system.dt; };
  Simulation.prototype.separation = function () { return distance(this.base, this.twin); };
  Simulation.prototype.growthEstimate = function () {
    return this.probeValid && this.measurementTime >= 2 ? this.logGrowth / this.measurementTime : null;
  };

  return { systems: systems, SIGMA: SIGMA, BETA: BETA, LORENZ_HOPF: LORENZ_HOPF,
    clampParameter: clampParameter, rk4Step: rk4Step, distance: distance,
    createReference: createReference, Simulation: Simulation };
});
