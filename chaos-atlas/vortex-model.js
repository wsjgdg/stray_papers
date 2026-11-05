/* Two coaxial circular vortex filaments in an unbounded, idealized fluid.
   State = [R_A, Z_A, R_B, Z_B]. Circulations and all units are dimensionless.
   A regularized Biot–Savart kernel removes the singular filament core; it is
   NOT a Navier–Stokes solver, viscous smoke model, or reconnection model. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VortexRings = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DT = 1 / 120;
  const CORE = 0.12;
  const SAMPLES = 256;
  const COS = new Float64Array(SAMPLES);
  const ONE_MINUS_COS = new Float64Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    COS[i] = Math.cos((i + 0.5) * 2 * Math.PI / SAMPLES);
    ONE_MINUS_COS[i] = 1 - COS[i];
  }
  const FACTOR = 1 / (2 * SAMPLES); // Γ/(4π) × Δθ

  function finiteArray(value, length) {
    return value && value.length === length && Array.from(value).every(Number.isFinite);
  }
  function validState(state, gamma, core = CORE) {
    return finiteArray(state, 4) && state[0] > 0 && state[2] > 0 &&
      finiteArray(gamma, 2) && Number.isFinite(core) && core > 0;
  }
  // Velocity at (r,z) induced by one circular filament, in its meridian
  // plane. Both source and sample use the same softened kernel:
  //   Γ/(4π) ∮ dℓ × (x − x') / (|x − x'|² + ε²)^(3/2).
  function sourceVelocity(r, z, R, Z, gamma, core) {
    if (gamma === 0) return [0, 0];
    const dz = z - Z, base = r * r + R * R + dz * dz + core * core, twice = 2 * r * R;
    let radial = 0, axial = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const c = COS[i], q = Math.max(Number.MIN_VALUE, base - twice * c), inverse = 1 / (q * Math.sqrt(q));
      radial += c * inverse;
      axial += (R * R - R * r * c) * inverse;
    }
    return [gamma * R * dz * radial * FACTOR, gamma * axial * FACTOR];
  }
  function selfVelocity(R, gamma, core) {
    if (gamma === 0) return 0;
    const rr = R * R, cc = core * core;
    let sum = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const term = rr * ONE_MINUS_COS[i], q = 2 * term + cc;
      sum += term / (q * Math.sqrt(q));
    }
    return gamma * sum * FACTOR;
  }
  // A signed radius is convenient for a complete meridian section: negative
  // r denotes the opposite side of the axis. The returned radial velocity is
  // signed in that same section, not an independent third fluid dimension.
  function fieldAt(state, gamma, r, z, core = CORE) {
    if (!validState(state, gamma, core) || !Number.isFinite(r) || !Number.isFinite(z)) throw new Error('Invalid vortex field coordinates.');
    const a = sourceVelocity(Math.abs(r), z, state[0], state[1], gamma[0], core);
    const b = sourceVelocity(Math.abs(r), z, state[2], state[3], gamma[1], core);
    return [(r === 0 ? 0 : Math.sign(r) * (a[0] + b[0])), a[1] + b[1]];
  }
  // Each ring moves with the field at its own filament. Symmetry reduces the
  // exact 3D integral to two radii and two axial positions, not a prescribed
  // animation. Shared quadrature preserves the paired radial symmetry.
  function ratesUnchecked(s, gamma, core, out) {
    const [rA, zA, rB, zB] = s, [gA, gB] = gamma, dz = zA - zB;
    const base = rA * rA + rB * rB + dz * dz + core * core, twice = 2 * rA * rB;
    let i0 = 0, ic = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const c = COS[i], q = Math.max(Number.MIN_VALUE, base - twice * c), inverse = 1 / (q * Math.sqrt(q));
      i0 += inverse; ic += c * inverse;
    }
    const k = FACTOR;
    out[0] = gB * rB * dz * ic * k;
    out[1] = selfVelocity(rA, gA, core) + gB * (rB * rB * i0 - rA * rB * ic) * k;
    out[2] = -gA * rA * dz * ic * k;
    out[3] = selfVelocity(rB, gB, core) + gA * (rA * rA * i0 - rA * rB * ic) * k;
    return out;
  }
  function rates(state, gamma, core = CORE) {
    if (!validState(state, gamma, core)) throw new Error('Invalid vortex ring state.');
    return Array.from(ratesUnchecked(state, gamma, core, new Float64Array(4)));
  }
  function advance(state, gamma, h = DT, core = CORE) {
    if (!validState(state, gamma, core) || !Number.isFinite(h)) throw new Error('Invalid vortex ring step.');
    const k1 = new Float64Array(4), k2 = new Float64Array(4), k3 = new Float64Array(4), k4 = new Float64Array(4), tmp = new Float64Array(4);
    ratesUnchecked(state, gamma, core, k1);
    for (let i = 0; i < 4; i++) tmp[i] = state[i] + h * k1[i] / 2;
    if (!(tmp[0] > 0 && tmp[2] > 0)) return null;
    ratesUnchecked(tmp, gamma, core, k2);
    for (let i = 0; i < 4; i++) tmp[i] = state[i] + h * k2[i] / 2;
    if (!(tmp[0] > 0 && tmp[2] > 0)) return null;
    ratesUnchecked(tmp, gamma, core, k3);
    for (let i = 0; i < 4; i++) tmp[i] = state[i] + h * k3[i];
    if (!(tmp[0] > 0 && tmp[2] > 0)) return null;
    ratesUnchecked(tmp, gamma, core, k4);
    const next = new Float64Array(4);
    for (let i = 0; i < 4; i++) next[i] = state[i] + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6;
    return validState(next, gamma, core) ? next : null;
  }
  // S is the circulation-weighted area divided by π. With a shared kernel it
  // is conserved by the continuous axisymmetric equations, even for Γ<0.
  function weightedArea(state, gamma) {
    if (!validState(state, gamma)) throw new Error('Invalid vortex ring state.');
    return gamma[0] * state[0] * state[0] + gamma[1] * state[2] * state[2];
  }
  function coreDistance(state) { return Math.hypot(state[0] - state[2], state[1] - state[3]); }

  function Experiment(initial, gamma, core = CORE) {
    if (!validState(initial, gamma, core)) throw new Error('Invalid vortex ring state.');
    this.state = Float64Array.from(initial); this.initial = Array.from(initial);
    this.gamma = Array.from(gamma); this.core = core; this.steps = 0;
    this.initialArea = weightedArea(initial, gamma);
    this.areaScale = Math.max(1e-12, Math.abs(gamma[0]) * initial[0] ** 2 + Math.abs(gamma[1]) * initial[2] ** 2);
    this.passages = 0; this.lastPassage = null; this._pendingPassage = null;
  }
  Experiment.prototype.time = function () { return this.steps * DT; };
  Experiment.prototype.areaError = function () { return (weightedArea(this.state, this.gamma) - this.initialArea) / this.areaScale; };
  Experiment.prototype.rates = function () { return rates(this.state, this.gamma, this.core); };
  // Keep the side before an exact axial tie until the next nonzero sample.
  // Merely touching or starting at a tie is not a position exchange.
  Experiment.prototype._trackPassage = function (before, after) {
    this.lastPassage = null;
    const d0 = before[1] - before[3], d1 = after[1] - after[3];
    let candidate = null;
    if (d0 !== 0 && d1 !== 0 && Math.sign(d0) !== Math.sign(d1)) {
      const f = Math.abs(d0) / (Math.abs(d0) + Math.abs(d1));
      candidate = { ra: before[0] + f * (after[0] - before[0]), rb: before[2] + f * (after[2] - before[2]), time: (this.steps + f) * DT };
      this._pendingPassage = null;
    } else if (d0 !== 0 && d1 === 0) {
      this._pendingPassage = { side: Math.sign(d0), ra: after[0], rb: after[2], time: (this.steps + 1) * DT };
    } else if (d0 === 0 && d1 !== 0) {
      if (this._pendingPassage && Math.sign(d1) !== this._pendingPassage.side) candidate = this._pendingPassage;
      this._pendingPassage = null;
    } else if (d0 !== 0 && d1 !== 0) {
      this._pendingPassage = null;
    }
    if (candidate && Math.abs(candidate.ra - candidate.rb) > 2 * this.core) {
      this.passages++;
      this.lastPassage = { time: candidate.time, inner: candidate.ra < candidate.rb ? 'A' : 'B' };
    }
  };
  Experiment.prototype.step = function () {
    const before = this.state, after = advance(before, this.gamma, DT, this.core);
    if (!after) return false;
    this._trackPassage(before, after);
    before.set(after); this.steps++;
    return true;
  };
  return { DT, CORE, SAMPLES, validState, fieldAt, rates, advance, weightedArea, coreDistance, Experiment };
});
