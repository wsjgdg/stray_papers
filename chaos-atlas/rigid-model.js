/* Three-dimensional rigid-body dynamics with an optional constant world-frame force.
   This module contains no rendering or browser dependencies. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FreeRigidBody = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DT = 1 / 240;
  const DEFAULT_INERTIA = [1.0, 2.0, 2.6];
  const DEFAULT_OMEGA = [0.10, 3.2, 0.15];
  const DEFAULT_ORIENTATION = [0, 0, 0, 1]; // x, y, z, w; body -> inertial frame

  function validInertia(inertia) {
    return Array.isArray(inertia) && inertia.length === 3 && inertia.every(x => Number.isFinite(x) && x > 0)
      && inertia[0] + inertia[1] > inertia[2]
      && inertia[0] + inertia[2] > inertia[1]
      && inertia[1] + inertia[2] > inertia[0];
  }
  function boxDimensions(inertia, mass) {
    if (!validInertia(inertia) || !Number.isFinite(mass) || mass <= 0) throw new Error('Invalid moments of inertia or mass.');
    const [ix, iy, iz] = inertia, f = 6 / mass;
    // I_x = m(b²+c²)/12, and cyclic permutations.
    return [Math.sqrt(f * (iy + iz - ix)), Math.sqrt(f * (ix + iz - iy)), Math.sqrt(f * (ix + iy - iz))];
  }
  function normalizeQuaternion(q) {
    const n = Math.hypot(q[0], q[1], q[2], q[3]);
    if (!Number.isFinite(n) || n < 1e-12) throw new Error('Invalid orientation.');
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  function multiplyQuaternion(a, b) {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz];
  }
  function axisAngle(axis, angle) {
    const length = Math.hypot(axis[0], axis[1], axis[2]);
    if (!length) return [0, 0, 0, 1];
    const s = Math.sin(angle / 2) / length;
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
  }
  function rotate(q, v) {
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx + w * tx + y * tz - z * ty,
      vy + w * ty + z * tx - x * tz,
      vz + w * tz + x * ty - y * tx];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function vector3(value, name) {
    if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) throw new Error('Invalid ' + name + '.');
    return value.slice();
  }
  // Azimuth runs from +X towards +Z; elevation is measured from the XZ plane.
  function forceFromAngles(magnitude, azimuthDegrees, elevationDegrees) {
    if (![magnitude, azimuthDegrees, elevationDegrees].every(Number.isFinite) || magnitude < 0) throw new Error('Invalid force.');
    const azimuth = azimuthDegrees * Math.PI / 180, elevation = elevationDegrees * Math.PI / 180;
    // Canonicalize trigonometric roundoff at cardinal directions. In
    // particular, changing azimuth at a pole must not change the force.
    const tiny = 2 * Number.EPSILON * magnitude;
    return [magnitude * Math.cos(elevation) * Math.cos(azimuth), magnitude * Math.sin(elevation), magnitude * Math.cos(elevation) * Math.sin(azimuth)]
      .map(value => Math.abs(value) <= tiny ? 0 : value);
  }
  function orderedAxes(inertia) {
    const order = [0, 1, 2].sort((a, b) => inertia[a] - inertia[b]);
    return { order, distinct: inertia[order[1]] - inertia[order[0]] > 1e-9 && inertia[order[2]] - inertia[order[1]] > 1e-9 };
  }
  function presetOmega(inertia, role, magnitude) {
    const sorted = orderedAxes(inertia), index = sorted.order[role === 'small' ? 0 : role === 'large' ? 2 : 1];
    const omega = [0.10, 0.10, 0.15];
    omega[index] = Number.isFinite(magnitude) ? magnitude : 3.2;
    return omega;
  }
  function derivative(y, inertia, force, point, mass, out) {
    const [i1, i2, i3] = inertia;
    const wx = y[0], wy = y[1], wz = y[2];
    const qx = y[3], qy = y[4], qz = y[5], qw = y[6];
    let torque = [0, 0, 0];
    if ((force[0] || force[1] || force[2]) && (point[0] || point[1] || point[2])) {
      // Intermediate RK stages are not exactly unit quaternions. Normalize for
      // the frame transformation; point stays fixed in body coordinates.
      const n = Math.hypot(qx, qy, qz, qw);
      const bodyForce = rotate([-qx / n, -qy / n, -qz / n, qw / n], force);
      torque = cross(point, bodyForce);
    }
    out[0] = ((i2 - i3) * wy * wz + torque[0]) / i1;
    out[1] = ((i3 - i1) * wz * wx + torque[1]) / i2;
    out[2] = ((i1 - i2) * wx * wy + torque[2]) / i3;
    // q maps body coordinates to the inertial frame: q' = 1/2 q * (ω,0).
    out[3] = 0.5 * (qw * wx + qy * wz - qz * wy);
    out[4] = 0.5 * (qw * wy + qz * wx - qx * wz);
    out[5] = 0.5 * (qw * wz + qx * wy - qy * wx);
    out[6] = -0.5 * (qx * wx + qy * wy + qz * wz);
    // Center of mass: m r'' = F, with F fixed in the world frame.
    out[7] = y[10]; out[8] = y[11]; out[9] = y[12];
    out[10] = force[0] / mass; out[11] = force[1] / mass; out[12] = force[2] / mass;
  }
  function FreeBody(inertia, omega, orientation, options) {
    if (!validInertia(inertia)) throw new Error('Moments must be positive and satisfy the strict triangle inequalities.');
    const initialOmega = vector3(omega, 'angular velocity'), q = normalizeQuaternion(orientation || DEFAULT_ORIENTATION);
    const config = options || {};
    this.mass = config.mass === undefined ? 1 : config.mass;
    if (!Number.isFinite(this.mass) || this.mass <= 0) throw new Error('Invalid mass.');
    this.force = vector3(config.force === undefined ? [0, 0, 0] : config.force, 'force');
    this.point = vector3(config.point === undefined ? [0, 0, 0] : config.point, 'force application point');
    const position = vector3(config.position === undefined ? [0, 0, 0] : config.position, 'position');
    const velocity = vector3(config.velocity === undefined ? [0, 0, 0] : config.velocity, 'velocity');
    this.inertia = inertia.slice();
    this.state = new Float64Array([...initialOmega, ...q, ...position, ...velocity]);
    this.work = Array.from({ length: 5 }, () => new Float64Array(13));
    this.steps = 0;
    this.initialEnergy = this.energy();
    this.initialMomentum = this.worldMomentum();
    this.initialMechanicalEnergy = this.mechanicalEnergy();
    this.initialLinearMomentum = this.linearMomentum();
    this.rebaseDiagnostics();
  }
  // A force is constant between edits. Rebase conservation checks when it or
  // its body-fixed application point changes, without changing the motion.
  FreeBody.prototype.rebaseDiagnostics = function () {
    this.segment = { startStep: this.steps, energy: this.energy(), momentum: this.worldMomentum(),
      mechanicalEnergy: this.mechanicalEnergy(), linearMomentum: this.linearMomentum() };
  };
  FreeBody.prototype.setForce = function (force, point) {
    const nextForce = vector3(force, 'force');
    const nextPoint = vector3(point === undefined ? this.point : point, 'force application point');
    if (nextForce.every((value, i) => value === this.force[i]) && nextPoint.every((value, i) => value === this.point[i])) return false;
    this.force = nextForce; this.point = nextPoint;
    this.rebaseDiagnostics();
    return true;
  };
  FreeBody.prototype.segmentTime = function () { return (this.steps - this.segment.startStep) * DT; };
  FreeBody.prototype.step = function () {
    const y = this.state, [a, b, c, d, temp] = this.work, h = DT;
    derivative(y, this.inertia, this.force, this.point, this.mass, a);
    for (let i = 0; i < 13; i++) temp[i] = y[i] + h * a[i] / 2;
    derivative(temp, this.inertia, this.force, this.point, this.mass, b);
    for (let i = 0; i < 13; i++) temp[i] = y[i] + h * b[i] / 2;
    derivative(temp, this.inertia, this.force, this.point, this.mass, c);
    for (let i = 0; i < 13; i++) temp[i] = y[i] + h * c[i];
    derivative(temp, this.inertia, this.force, this.point, this.mass, d);
    for (let i = 0; i < 13; i++) y[i] += h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6;
    const n = Math.hypot(y[3], y[4], y[5], y[6]);
    if (!Number.isFinite(n) || n < 1e-12 || !y.every(Number.isFinite)) return false;
    for (let i = 3; i < 7; i++) y[i] /= n;
    this.steps++;
    return true;
  };
  FreeBody.prototype.time = function () { return this.steps * DT; };
  FreeBody.prototype.omega = function () { return [this.state[0], this.state[1], this.state[2]]; };
  FreeBody.prototype.orientation = function () { return [this.state[3], this.state[4], this.state[5], this.state[6]]; };
  FreeBody.prototype.position = function () { return [this.state[7], this.state[8], this.state[9]]; };
  FreeBody.prototype.velocity = function () { return [this.state[10], this.state[11], this.state[12]]; };
  // Both vectors are inertial-frame quantities. A zero vector has no direction;
  // normalizing before the dot product also avoids unnecessary large products.
  FreeBody.prototype.forceVelocityAngle = function () {
    const velocity = this.velocity(), speed = Math.hypot(...velocity), magnitude = Math.hypot(...this.force);
    if (speed <= 1e-10 || magnitude <= 1e-10) return null;
    const cosine = this.force.reduce((sum, value, i) => sum + (value / magnitude) * (velocity[i] / speed), 0);
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  };
  // energy() and worldMomentum() refer to rotation about the center of mass.
  FreeBody.prototype.energy = function () {
    const y = this.state, i = this.inertia;
    return 0.5 * (i[0] * y[0] ** 2 + i[1] * y[1] ** 2 + i[2] * y[2] ** 2);
  };
  FreeBody.prototype.bodyMomentum = function () {
    return this.inertia.map((i, axis) => i * this.state[axis]);
  };
  FreeBody.prototype.worldMomentum = function () { return rotate(this.orientation(), this.bodyMomentum()); };
  FreeBody.prototype.worldOmega = function () { return rotate(this.orientation(), this.omega()); };
  FreeBody.prototype.momentumMagnitude = function () { return Math.hypot(...this.bodyMomentum()); };
  FreeBody.prototype.forcePoint = function () {
    const offset = rotate(this.orientation(), this.point), center = this.position();
    return center.map((value, i) => value + offset[i]);
  };
  FreeBody.prototype.worldTorque = function () { return cross(rotate(this.orientation(), this.point), this.force); };
  FreeBody.prototype.bodyTorque = function () {
    const [x, y, z, w] = this.orientation();
    return cross(this.point, rotate([-x, -y, -z, w], this.force));
  };
  FreeBody.prototype.linearMomentum = function () { return this.velocity().map(value => this.mass * value); };
  FreeBody.prototype.mechanicalEnergy = function () {
    const v = this.velocity(), at = this.forcePoint();
    // A spatially constant force acting at this body-fixed point has U = -F·r_point.
    return this.energy() + .5 * this.mass * v.reduce((sum, value) => sum + value * value, 0)
      - this.force.reduce((sum, value, i) => sum + value * at[i], 0);
  };
  FreeBody.prototype.axisAlignment = function (axis) {
    const magnitude = this.momentumMagnitude();
    return magnitude > 1e-12 ? this.inertia[axis] * this.state[axis] / magnitude : null;
  };
  FreeBody.prototype.energyError = function () { return this.energy() - this.segment.energy; };
  FreeBody.prototype.mechanicalEnergyError = function () { return this.mechanicalEnergy() - this.segment.mechanicalEnergy; };
  FreeBody.prototype.momentumError = function () {
    const h = this.worldMomentum(), initial = this.segment.momentum;
    return Math.hypot(h[0] - initial[0], h[1] - initial[1], h[2] - initial[2]);
  };
  FreeBody.prototype.linearMomentumError = function () {
    const p = this.linearMomentum(), t = this.segmentTime();
    return Math.hypot(...p.map((value, i) => value - this.segment.linearMomentum[i] - this.force[i] * t));
  };
  return { DT, DEFAULT_INERTIA, DEFAULT_OMEGA, DEFAULT_ORIENTATION, validInertia, boxDimensions,
    normalizeQuaternion, multiplyQuaternion, axisAngle, rotate, forceFromAngles, orderedAxes, presetOmega, FreeBody };
});
