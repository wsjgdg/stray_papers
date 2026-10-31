import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const RADIUS = 4.2;
export const SEA_LEVEL = 0.012;
export const SEA_RADIUS = RADIUS + SEA_LEVEL;
export const EYE_HEIGHT = 0.16;
export const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const isCompact = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
export const INITIAL_YAW = 0.42;
export const INITIAL_POLAR = 1.16;

export function basePixelRatio(width, height) {
  const pixelBudget = isCompact ? 1500000 : 3200000;
  return Math.min(window.devicePixelRatio || 1, isCompact ? 1.35 : 1.7, Math.sqrt(pixelBudget / (width * height)));
}

// One deterministic PRNG shared by every generator, so the planet is reproducible.
let seed = 819213;
export function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const mix = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483647.5 - 1;
}
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  x -= ix; y -= iy; z -= iz;
  const u = x * x * (3 - 2 * x), v = y * y * (3 - 2 * y), w = z * z * (3 - 2 * z);
  const a = mix(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), u);
  const b = mix(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), u);
  const c = mix(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), u);
  const d = mix(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), u);
  return mix(mix(a, b, v), mix(c, d, v), w);
}

// Shared celestial vectors: lights, shaders and sprites all read the same instances.
export const sunDirection = new THREE.Vector3(-0.8, 0.4, 0.5).normalize();
export const moonDirection = new THREE.Vector3(0.64, 0.22, -0.73).normalize();

// The same height function drives the visible mesh, prop placement, and walking collision.
export function heightAt(n) {
  const warp = noise3(n.x * 2.6 + 13, n.y * 2.6 - 7, n.z * 2.6 + 4) * 0.19;
  const x = n.x + warp, y = n.y - warp * 0.58, z = n.z + warp * 0.36;
  const islands = noise3(x * 2.15 + 4, y * 2.15 + 9, z * 2.15 - 3) * 0.68
    + noise3(x * 4.7 - 8, y * 4.7 + 1, z * 4.7 + 5) * 0.33
    + noise3(x * 9.4 + 2, y * 9.4 - 6, z * 9.4 + 11) * 0.14 - 0.025;
  const ridge = 1 - Math.abs(noise3(x * 9.5 + 23, y * 9.5 - 13, z * 9.5 + 2));
  const highland = Math.max(0, islands - 0.07);
  const mountains = Math.pow(ridge, 4) * Math.pow(highland, 1.15) * 1.3;
  const detail = noise3(n.x * 28 + 3, n.y * 28 - 5, n.z * 28 + 7) * 0.012;
  return islands * 0.61 + mountains + detail;
}
export function groundRadius(n) { return Math.max(RADIUS + heightAt(n), SEA_RADIUS); }
export function randomDirection() {
  const y = random() * 2 - 1, angle = random() * TAU, r = Math.sqrt(1 - y * y);
  return new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
}
export function orbitDirection(yaw, polar) {
  return new THREE.Vector3(Math.sin(polar) * Math.sin(yaw), Math.cos(polar), Math.sin(polar) * Math.cos(yaw));
}

const colors = {
  seabed: new THREE.Color('#173d49'),
  sand: new THREE.Color('#d0c7a1'),
  meadow: new THREE.Color('#6fa989'),
  moss: new THREE.Color('#7fc292'),
  forest: new THREE.Color('#2d7770'),
  highland: new THREE.Color('#789b8b'),
  stone: new THREE.Color('#697b87'),
  snow: new THREE.Color('#d2ded7')
};
const tempColor = new THREE.Color();
export function terrainColor(n, h) {
  const biome = noise3(n.x * 8 + 19, n.y * 8 - 3, n.z * 8 + 5) * 0.5 + 0.5;
  const lushness = noise3(n.x * 17 - 8, n.y * 17 + 23, n.z * 17 + 4) * 0.5 + 0.5;
  if (h < SEA_LEVEL) return tempColor.copy(colors.seabed);
  if (h < 0.052) return tempColor.copy(colors.sand).lerp(colors.meadow, smoothstep(0.016, 0.06, h) * 0.72);
  if (h < 0.175) return tempColor.copy(colors.meadow).lerp(lushness > 0.5 ? colors.moss : colors.forest, smoothstep(0.04, 0.18, h) * (0.54 + biome * 0.46));
  if (h < 0.31) return tempColor.copy(colors.forest).lerp(colors.highland, smoothstep(0.16, 0.31, h) * (0.8 + lushness * 0.2));
  if (h < 0.45) return tempColor.copy(colors.highland).lerp(colors.stone, smoothstep(0.29, 0.45, h));
  return tempColor.copy(colors.stone).lerp(colors.snow, smoothstep(0.42, 0.61, h));
}

export function nearestLand(direction) {
  let best = null, bestScore = -Infinity;
  const count = 1800;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + 0.5) * 2 / count;
    const r = Math.sqrt(1 - y * y), angle = i * goldenAngle;
    const candidate = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
    const elevation = heightAt(candidate);
    if (elevation < 0.075 || elevation > 0.36) continue;
    const score = candidate.dot(direction) - Math.abs(elevation - 0.15) * 0.025;
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  return best || direction.clone();
}

// Fixed locations for the landing grove and its landmark ruin.
export function createSite(initialYaw, initialPolar) {
  const firstLanding = nearestLand(orbitDirection(initialYaw, initialPolar));
  const tangentEast = new THREE.Vector3().crossVectors(Y_AXIS, firstLanding).normalize();
  const tangentNorth = new THREE.Vector3().crossVectors(firstLanding, tangentEast).normalize();
  const primaryRuinDirection = firstLanding.clone().addScaledVector(tangentEast, 0.24).normalize();
  return {
    firstLanding,
    tangentEast,
    tangentNorth,
    primaryRuinDirection,
    nearbyDirection(minRadius, maxRadius) {
      const angle = random() * TAU;
      const radius = mix(minRadius, maxRadius, Math.sqrt(random()));
      return firstLanding.clone().multiplyScalar(Math.cos(radius))
        .addScaledVector(tangentEast, Math.cos(angle) * Math.sin(radius))
        .addScaledVector(tangentNorth, Math.sin(angle) * Math.sin(radius)).normalize();
    }
  };
}
