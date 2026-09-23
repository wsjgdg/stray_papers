/**
 * math-utils.ts — Orbital mechanics & coordinate transforms
 * Ported from the original simulator.
 */
import * as THREE from 'three';

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

const _v = new THREE.Vector3();

/** Build a unit direction vector from equatorial RA (hours) / Dec (degrees). */
export function unitDir(raH: number, decDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const ra = (raH / 24) * Math.PI * 2;
  const dec = decDeg * D2R;
  return out.set(
    Math.cos(dec) * Math.cos(ra),
    Math.sin(dec),
    -Math.cos(dec) * Math.sin(ra),
  );
}

/** Inverse of unitDir → [raHours, decDeg]. */
export function dirToRADec(v: THREE.Vector3): [number, number] {
  const n = _v.copy(v).normalize();
  const ra = ((Math.atan2(-n.z, n.x) / (Math.PI * 2)) * 24 + 24) % 24;
  const dec = Math.asin(n.y) * R2D;
  return [ra, dec];
}

/** Direction → [altitudeDeg, azimuthDeg]. */
export function dirToAltAz(v: THREE.Vector3): [number, number] {
  const n = _v.copy(v).normalize();
  const alt = Math.asin(n.y) * R2D;
  const az = (Math.atan2(n.z, n.x) * R2D + 360) % 360;
  return [alt, az];
}

/** Rotation matrix from orbital elements (Ω, i, ω). */
export function rotMatrix(b: { Om: number; i: number; w: number }): THREE.Matrix4 {
  return new THREE.Matrix4()
    .makeRotationZ(b.Om * D2R)
    .multiply(new THREE.Matrix4().makeRotationX(b.i * D2R))
    .multiply(new THREE.Matrix4().makeRotationZ(b.w * D2R));
}

/** Solve Kepler's equation, return heliocentric position in AU (ecliptic frame). */
export function posAU(
  b: any,
  t: number,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  out = out || new THREE.Vector3();
  if (b._n === undefined) {
    if (!b._m) b._m = rotMatrix(b);
    b._n = (2 * Math.PI) / b.P;
    b._q = Math.sqrt(1 - b.e * b.e);
  }
  const M = b.M0 * D2R + b._n * t;
  let E = M;
  for (let k = 0; k < 6; k++) {
    const dE = (E - b.e * Math.sin(E) - M) / (1 - b.e * Math.cos(E));
    E -= dE;
    if (dE < 1e-13 && dE > -1e-13) break;
  }
  const sE = Math.sin(E), cE = Math.cos(E);
  _v.set(b.a * (cE - b.e), b.a * b._q * sE, 0);
  _v.applyMatrix4(b._m);
  return out.set(_v.x, _v.z, -_v.y);
}

/** Compress vast AU distances into a viewable scene scale. */
export function scalePos(p: THREE.Vector3, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  out = out || new THREE.Vector3();
  const r = p.length();
  if (r < 1e-9) return out.copy(p);
  return out.copy(p).multiplyScalar(K * Math.pow(r, POW - 1));
}
export const K = 15;
export const POW = 0.55;

export function fmtRA(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60) % 60;
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}
export function fmtDec(d: number): string {
  const s = d < 0 ? '−' : '+';
  const ad = Math.abs(d);
  const dd = Math.floor(ad);
  const dm = Math.round((ad - dd) * 60) % 60;
  return `${s}${dd}° ${String(dm).padStart(2, '0')}′`;
}
export function fmtDeg(x: number): string {
  return (x < 0 ? '−' : '') + Math.abs(x).toFixed(1) + '°';
}
export function fmtP(d: number): string {
  return d >= 500 ? (d / 365.25).toFixed(1) + ' 年' : d.toFixed(1) + ' 天';
}

/** Galactic (l,b) in degrees → unit 3-vector (galactic frame, x toward GC). */
export function galacticDir(lDeg: number, bDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const l = lDeg * D2R, b = bDeg * D2R;
  return out.set(Math.cos(b) * Math.cos(l), Math.sin(b), Math.cos(b) * Math.sin(l));
}

/** Format a light-year distance with sensible units. */
export function fmtLy(ly: number): string {
  if (ly >= 1e9) return (ly / 1e9).toFixed(2) + ' Gly';
  if (ly >= 1e6) return (ly / 1e6).toFixed(2) + ' Mly';
  if (ly >= 1e3) return (ly / 1e3).toFixed(2) + ' kly';
  return ly.toFixed(0) + ' ly';
}

/** Format a parsec distance. */
export function fmtMpc(mpc: number): string {
  if (mpc >= 1000) return (mpc / 1000).toFixed(2) + ' Gpc';
  if (mpc >= 1) return mpc.toFixed(1) + ' Mpc';
  return (mpc * 1000).toFixed(0) + ' kpc';
}
