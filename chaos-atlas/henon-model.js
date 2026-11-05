/* Dimensionless Hénon–Heiles Hamiltonian, independent of the browser.
   State is [x, y, p_x, p_y]; kinetic energy is (p_x²+p_y²)/2. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HenonHeiles = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DT = 1 / 240;
  const SADDLE_ENERGY = 1 / 6;
  const SADDLES = [[0, 1], [Math.sqrt(3) / 2, -0.5], [-Math.sqrt(3) / 2, -0.5]];

  function potential(x, y) { return 0.5 * (x * x + y * y) + x * x * y - y * y * y / 3; }
  function gradient(x, y) { return [x + 2 * x * y, y + x * x - y * y]; }
  function energy(state) { return 0.5 * (state[2] * state[2] + state[3] * state[3]) + potential(state[0], state[1]); }

  // Nearest visible intersection with the *actual* cubic graph h=V(x,y).
  // The ray uses graph coordinates [x,y,h], not the display's exaggerated
  // vertical scale. Splitting at stationary points catches tangencies and
  // multiple foreground/background intersections without a mesh dependency.
  function intersectPotentialRay(origin, direction, radius = 1.5, cap = .36) {
    if (!origin || !direction || origin.length !== 3 || direction.length !== 3 ||
        ![...origin, ...direction, radius, cap].every(Number.isFinite) || radius <= 0) return null;
    const [ox, oy, oh] = origin, [dx, dy, dh] = direction;
    const a = dx * dx + dy * dy, c = ox * ox + oy * oy - radius * radius;
    function hit(t) {
      if (!Number.isFinite(t) || t < 0) return null;
      const x = ox + t * dx, y = oy + t * dy, v = potential(x, y);
      if (Math.hypot(x, y) > radius + 1e-8 || v > cap + 1e-10) return null;
      return { x, y, v, t };
    }
    if (a < 1e-20) {
      if (c > 0 || Math.abs(dh) < 1e-14) return null;
      return hit((potential(ox, oy) - oh) / dh);
    }
    const b = 2 * (ox * dx + oy * dy), disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(Math.max(0, disc)), lo = Math.max(0, (-b - root) / (2 * a)), hi = (-b + root) / (2 * a);
    if (hi < lo) return null;
    function value(t) { return oh + t * dh - potential(ox + t * dx, oy + t * dy); }
    function slope(t) {
      const g = gradient(ox + t * dx, oy + t * dy);
      return dh - g[0] * dx - g[1] * dy;
    }
    const s0 = slope(lo), sm = slope((lo + hi) / 2), s1 = slope(hi);
    const A = 2 * (s1 + s0 - 2 * sm), B = s1 - s0 - A, C = s0;
    const splits = [0, 1], scale = Math.max(1, Math.abs(A), Math.abs(B), Math.abs(C));
    if (Math.abs(A) < 1e-12 * scale) {
      if (Math.abs(B) > 1e-12 * scale) splits.push(-C / B);
    } else {
      const d = B * B - 4 * A * C;
      if (d >= 0) { const r = Math.sqrt(d); splits.push((-B - r) / (2 * A), (-B + r) / (2 * A)); }
    }
    const points = splits.filter(u => u >= 0 && u <= 1).sort((x, y) => x - y)
      .filter((u, i, arr) => i === 0 || u - arr[i - 1] > 1e-10).map(u => lo + (hi - lo) * u);
    for (let i = 0; i < points.length; i++) {
      const left = points[i], f0 = value(left);
      if (Math.abs(f0) < 1e-10) { const candidate = hit(left); if (candidate) return candidate; }
      if (i === points.length - 1) continue;
      let l = left, r = points[i + 1], fl = f0, fr = value(r);
      if (fl * fr >= 0) continue;
      for (let j = 0; j < 48; j++) {
        const mid = (l + r) / 2, fm = value(mid);
        if ((fl < 0) === (fm < 0)) { l = mid; fl = fm; } else { r = mid; fr = fm; }
      }
      const candidate = hit((l + r) / 2); if (candidate) return candidate;
    }
    return null;
  }
  function validState(state) { return state && state.length === 4 && Array.from(state).every(Number.isFinite); }
  function initialState(total, x, y, angle) {
    if (![total, x, y, angle].every(Number.isFinite)) throw new Error('Initial conditions must be finite.');
    const kinetic = total - potential(x, y);
    if (kinetic < -1e-12) throw new Error('Initial potential exceeds the total energy.');
    const speed = Math.sqrt(2 * Math.max(0, kinetic));
    return [x, y, speed * Math.cos(angle), speed * Math.sin(angle)];
  }
  // A point on the directed section y=0, p_y>0 fixes p_y through the
  // Hamiltonian. The circle itself has p_y=0 and is not an upward crossing.
  function sectionInitialState(total, x, px) {
    if (![total, x, px].every(Number.isFinite)) throw new Error('Section coordinates and energy must be finite.');
    const pySquared = 2 * total - x * x - px * px;
    if (!Number.isFinite(pySquared) || !(pySquared > 0)) throw new Error('An upward section initial state must lie strictly inside the energy circle.');
    return [x, 0, px, Math.sqrt(pySquared)];
  }
  // Explicit RK4 for Hamilton's equations. The output may be the input array.
  function advance(state, h, output) {
    const x = state[0], y = state[1], px = state[2], py = state[3];
    const x1 = px, y1 = py, px1 = -x - 2 * x * y, py1 = -y - x * x + y * y;
    let xx = x + h * x1 / 2, yy = y + h * y1 / 2;
    const x2 = px + h * px1 / 2, y2 = py + h * py1 / 2;
    const px2 = -xx - 2 * xx * yy, py2 = -yy - xx * xx + yy * yy;
    xx = x + h * x2 / 2; yy = y + h * y2 / 2;
    const x3 = px + h * px2 / 2, y3 = py + h * py2 / 2;
    const px3 = -xx - 2 * xx * yy, py3 = -yy - xx * xx + yy * yy;
    xx = x + h * x3; yy = y + h * y3;
    const x4 = px + h * px3, y4 = py + h * py3;
    const px4 = -xx - 2 * xx * yy, py4 = -yy - xx * xx + yy * yy;
    const next = output || new Float64Array(4), k = h / 6;
    next[0] = x + k * (x1 + 2 * x2 + 2 * x3 + x4);
    next[1] = y + k * (y1 + 2 * y2 + 2 * y3 + y4);
    next[2] = px + k * (px1 + 2 * px2 + 2 * px3 + px4);
    next[3] = py + k * (py1 + 2 * py2 + 2 * py3 + py4);
    return next;
  }
  // A directed Poincaré section: y=0 with p_y>0. Interpolate across a
  // public step; the interpolation is a display measurement, not a new state.
  function sectionCrossing(before, after) {
    if (!(before[1] <= 0 && after[1] > 0)) return null;
    const fraction = -before[1] / (after[1] - before[1]);
    const py = before[3] + fraction * (after[3] - before[3]);
    if (!(py > 0)) return null;
    return { x: before[0] + fraction * (after[0] - before[0]),
      px: before[2] + fraction * (after[2] - before[2]), py, fraction };
  }
  function outsideObservation(state, radius) {
    return Math.hypot(state[0], state[1]) >= radius && state[0] * state[2] + state[1] * state[3] > 0;
  }
  function Experiment(initial) {
    if (!validState(initial)) throw new Error('Invalid Hénon–Heiles state.');
    this.state = new Float64Array(initial);
    this.initial = Array.from(initial);
    this.initialEnergy = energy(initial);
    this.steps = 0;
    this.lastCrossing = null;
    this.scratch = new Float64Array(4);
  }
  Experiment.prototype.time = function () { return this.steps * DT; };
  Experiment.prototype.energy = function () { return energy(this.state); };
  Experiment.prototype.energyError = function () { return this.energy() - this.initialEnergy; };
  Experiment.prototype.step = function () {
    const before = this.state, after = advance(before, DT, this.scratch);
    if (!Number.isFinite(after[0]) || !Number.isFinite(after[1]) || !Number.isFinite(after[2]) || !Number.isFinite(after[3])) return false;
    this.lastCrossing = sectionCrossing(before, after);
    if (this.lastCrossing) this.lastCrossing.time = (this.steps + this.lastCrossing.fraction) * DT;
    before.set(after);
    this.steps++;
    return true;
  };
  return { DT, SADDLE_ENERGY, SADDLES, potential, gradient, energy, intersectPotentialRay, initialState, sectionInitialState, advance, sectionCrossing, outsideObservation, Experiment };
});
