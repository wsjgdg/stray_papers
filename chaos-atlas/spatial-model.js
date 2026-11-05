/* Spatial N-link pendulum with massless, rigid rods and spherical joints. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SpatialPendulum = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DT = 1 / 240, RAD = Math.PI / 180;
  const PRESETS = Object.freeze({
    butterfly: { gravity: 9.8, massRatio: 1, perturbation: 0.1, links: [{ theta: 115, phi: -25 }, { theta: 65, phi: 55 }] },
    gentle: { gravity: 9.8, massRatio: 1, perturbation: 0.1, links: [{ theta: 18, phi: 0 }, { theta: 12, phi: 0 }] },
    energetic: { gravity: 9.8, massRatio: 1, perturbation: 0.1, links: [{ theta: 145, phi: 0 }, { theta: 115, phi: 0 }] }
  });
  const DEFAULTS = PRESETS.butterfly;
  function clamp(value, min, max, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }
  function normalize(config) {
    config = config || {};
    const links = Array.isArray(config.links) && config.links.length ? config.links : DEFAULTS.links;
    return {
      gravity: clamp(config.gravity, 2, 15, DEFAULTS.gravity),
      massRatio: clamp(config.massRatio, 0.5, 2.5, DEFAULTS.massRatio),
      perturbation: clamp(config.perturbation, 0.01, 1, DEFAULTS.perturbation),
      links: links.map(link => ({ theta: clamp(link && link.theta, 0, 180, 0), phi: clamp(link && link.phi, -180, 180, 0) })),
      length: 1, mass1: 1
    };
  }
  // theta is the tilt from down; phi is azimuth in the x-z plane.
  function direction(theta, phi) {
    theta *= RAD; phi *= RAD;
    const s = Math.sin(theta);
    return [s * Math.cos(phi), -Math.cos(theta), s * Math.sin(phi)];
  }
  function angles(vector, previousPhi) {
    const length = Math.hypot(vector[0], vector[1], vector[2]);
    if (!length) return { theta: 0, phi: Number(previousPhi) || 0 };
    const x = vector[0] / length, y = vector[1] / length, z = vector[2] / length;
    const theta = Math.acos(Math.max(-1, Math.min(1, -y))) / RAD;
    const phi = Math.hypot(x, z) < 1e-8 ? (Number(previousPhi) || 0) : Math.atan2(z, x) / RAD;
    return { theta: theta, phi: phi };
  }
  function initialState(params) {
    const n = params.links.length, state = new Float64Array(6 * n);
    params.links.forEach((link, i) => state.set(direction(link.theta, link.phi), i * 3));
    return state;
  }
  function perturbLast(state, params) {
    const i = 3 * (params.links.length - 1), x = state[i], y = state[i + 1], z = state[i + 2];
    // Project +z into the plane perpendicular to the direction; if parallel,
    // choose +y instead. Rotating about this axis changes the angle by exactly δ.
    let ax = -z * x, ay = -z * y, az = 1 - z * z, length = Math.hypot(ax, ay, az);
    if (length < 1e-8) { ax = -y * x; ay = 1 - y * y; az = -y * z; length = Math.hypot(ax, ay, az); }
    ax /= length; ay /= length; az /= length;
    const d = params.perturbation * RAD, c = Math.cos(d), s = Math.sin(d);
    state[i] = x * c + (ay * z - az * y) * s;
    state[i + 1] = y * c + (az * x - ax * z) * s;
    state[i + 2] = z * c + (ax * y - ay * x) * s;
  }
  function positions(state, params) {
    const n = params.links.length, result = new Float64Array(n * 3), length = params.length;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const j = i * 3; x += length * state[j]; y += length * state[j + 1]; z += length * state[j + 2];
      result[j] = x; result[j + 1] = y; result[j + 2] = z;
    }
    return result;
  }
  function energy(state, params) {
    const n = params.links.length, offset = 3 * n, l = params.length;
    let y = 0, vx = 0, vy = 0, vz = 0, kinetic = 0, potential = 0;
    for (let i = 0; i < n; i++) {
      const j = 3 * i, m = i === 0 ? params.mass1 : params.mass1 * params.massRatio;
      y += l * state[j + 1]; vx += l * state[offset + j]; vy += l * state[offset + j + 1]; vz += l * state[offset + j + 2];
      kinetic += 0.5 * m * (vx * vx + vy * vy + vz * vz);
      potential += m * params.gravity * (y + (i + 1) * l);
    }
    return { kinetic: kinetic, potential: potential, total: kinetic + potential };
  }
  function phase(state, params) {
    const n = params.links.length, i = 3 * (n - 1), o = 3 * n + i;
    return { angle: Math.acos(Math.max(-1, Math.min(1, -state[i + 1]))),
      omega: Math.hypot(state[o], state[o + 1], state[o + 2]) };
  }
  function relativeAngle(state, params) {
    const n = params.links.length;
    if (n < 2) return null;
    const i = 3 * (n - 1), j = i - 3;
    const dot = state[i] * state[j] + state[i + 1] * state[j + 1] + state[i + 2] * state[j + 2];
    return Math.acos(Math.max(-1, Math.min(1, dot))) / RAD;
  }

  // Lagrange multipliers for the rigid rods form a symmetric tridiagonal
  // system. Solving it takes O(N), rather than inverting a dense mass matrix.
  // State contains N unit direction vectors followed by their time derivatives.
  function derivative(state, out, p, work) {
    const n = p.links.length, offset = 3 * n, invOther = 1 / (p.mass1 * p.massRatio);
    const upper = work.upper, diag = work.diag, rhs = work.rhs, tension = work.tension, accel = work.accel;
    for (let i = 0; i < n; i++) {
      const j = i * 3, inv = i ? invOther : 1 / p.mass1, invPrev = i ? (i === 1 ? 1 / p.mass1 : invOther) : 0;
      const x = state[j], y = state[j + 1], z = state[j + 2];
      const wx = state[offset + j], wy = state[offset + j + 1], wz = state[offset + j + 2];
      diag[i] = (inv + invPrev) * (x * x + y * y + z * z);
      rhs[i] = p.length * (wx * wx + wy * wy + wz * wz) + (i === 0 ? -p.gravity * y : 0);
      upper[i] = i + 1 < n ? -inv * (x * state[j + 3] + y * state[j + 4] + z * state[j + 5]) : 0;
    }
    for (let i = 1; i < n; i++) {
      const multiplier = upper[i - 1] / diag[i - 1];
      diag[i] -= multiplier * upper[i - 1]; rhs[i] -= multiplier * rhs[i - 1];
    }
    tension[n - 1] = rhs[n - 1] / diag[n - 1];
    for (let i = n - 2; i >= 0; i--) tension[i] = (rhs[i] - upper[i] * tension[i + 1]) / diag[i];
    for (let i = 0; i < n; i++) {
      const j = i * 3, inv = i ? invOther : 1 / p.mass1, next = i + 1 < n ? tension[i + 1] : 0;
      accel[j] = (-tension[i] * state[j] + next * (i + 1 < n ? state[j + 3] : 0)) * inv;
      accel[j + 1] = -p.gravity + (-tension[i] * state[j + 1] + next * (i + 1 < n ? state[j + 4] : 0)) * inv;
      accel[j + 2] = (-tension[i] * state[j + 2] + next * (i + 1 < n ? state[j + 5] : 0)) * inv;
    }
    for (let i = 0; i < n; i++) {
      const j = i * 3, previous = i ? j - 3 : -1;
      for (let k = 0; k < 3; k++) {
        out[j + k] = state[offset + j + k];
        out[offset + j + k] = (accel[j + k] - (previous < 0 ? 0 : accel[previous + k])) / p.length;
      }
    }
  }
  function project(state, n) {
    const offset = 3 * n;
    for (let i = 0; i < n; i++) {
      const j = 3 * i, norm = Math.hypot(state[j], state[j + 1], state[j + 2]);
      if (!Number.isFinite(norm) || norm < 1e-12) return false;
      const x = state[j] /= norm, y = state[j + 1] /= norm, z = state[j + 2] /= norm;
      const radial = x * state[offset + j] + y * state[offset + j + 1] + z * state[offset + j + 2];
      state[offset + j] -= radial * x; state[offset + j + 1] -= radial * y; state[offset + j + 2] -= radial * z;
    }
    return state.every(Number.isFinite);
  }
  function rk4(state, output, p, w, h) {
    const size = state.length, a = w.k1, b = w.k2, c = w.k3, d = w.k4, tmp = w.tmp;
    derivative(state, a, p, w);
    for (let i = 0; i < size; i++) tmp[i] = state[i] + h * a[i] / 2;
    derivative(tmp, b, p, w);
    for (let i = 0; i < size; i++) tmp[i] = state[i] + h * b[i] / 2;
    derivative(tmp, c, p, w);
    for (let i = 0; i < size; i++) tmp[i] = state[i] + h * c[i];
    derivative(tmp, d, p, w);
    for (let i = 0; i < size; i++) output[i] = state[i] + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6;
    return project(output, p.links.length);
  }
  function Experiment(config) {
    this.params = normalize(config);
    const n = this.params.links.length, size = n * 6;
    this.a = initialState(this.params); this.b = this.a.slice(); perturbLast(this.b, this.params);
    this.nextA = new Float64Array(size); this.nextB = new Float64Array(size);
    this.work = { upper: new Float64Array(n), diag: new Float64Array(n), rhs: new Float64Array(n), tension: new Float64Array(n), accel: new Float64Array(n * 3),
      k1: new Float64Array(size), k2: new Float64Array(size), k3: new Float64Array(size), k4: new Float64Array(size), tmp: new Float64Array(size) };
    this.initialEnergy = energy(this.a, this.params).total; this.steps = 0;
  }
  Experiment.prototype.step = function () {
    const n = this.params.links.length, offset = 3 * n;
    let maxSpeed = 0;
    for (let i = offset; i < 6 * n; i += 3) {
      maxSpeed = Math.max(maxSpeed, Math.hypot(this.a[i], this.a[i + 1], this.a[i + 2]), Math.hypot(this.b[i], this.b[i + 1], this.b[i + 2]));
    }
    // Long, energetic chains need smaller internal steps. The public clock and
    // single-step control still advance by DT; these substeps preserve stability.
    const substeps = Math.max(1, Math.ceil(Math.sqrt(n * this.params.gravity / 9.8) / 2.5), Math.ceil(maxSpeed * DT / 0.05));
    if (!Number.isFinite(substeps) || substeps > 128) return false;
    const h = DT / substeps;
    for (let i = 0; i < substeps; i++) {
      if (!rk4(this.a, this.nextA, this.params, this.work, h) || !rk4(this.b, this.nextB, this.params, this.work, h)) return false;
      [this.a, this.nextA] = [this.nextA, this.a]; [this.b, this.nextB] = [this.nextB, this.b];
    }
    this.steps++; return true;
  };
  Experiment.prototype.time = function () { return this.steps * DT; };
  Experiment.prototype.separation = function () {
    const n = this.params.links.length, length = this.params.length;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < n * 3; i += 3) { x += this.a[i] - this.b[i]; y += this.a[i + 1] - this.b[i + 1]; z += this.a[i + 2] - this.b[i + 2]; }
    return length * Math.hypot(x, y, z);
  };
  Experiment.prototype.energy = function () { return energy(this.a, this.params); };
  Experiment.prototype.energyDrift = function () { return this.energy().total - this.initialEnergy; };
  return { DT: DT, RAD: RAD, DEFAULTS: DEFAULTS, PRESETS: PRESETS, normalize: normalize,
    direction: direction, angles: angles, positions: positions, energy: energy, phase: phase, relativeAngle: relativeAngle, Experiment: Experiment };
});
