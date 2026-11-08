import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RADIUS, TAU, Y_AXIS, isCompact, random, randomDirection, noise3, heightAt, sunDirection } from './core.js';

// Bakes a flat color into a geometry's vertices so several parts can be merged
// into ONE instanced draw call per species.
function paint(geometry, hex) {
  const color = new THREE.Color(hex);
  const values = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    values[i * 3] = color.r;
    values[i * 3 + 1] = color.g;
    values[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}
function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  merged.computeBoundingSphere();
  return merged;
}

export function buildFlora(scene, site, pixelRatio) {
  const dummy = new THREE.Object3D();
  const glowPositions = [], glowSizes = [], glowPhases = [];
  const instanced = [];
  const { firstLanding, primaryRuinDirection, nearbyDirection } = site;
  const pushGlow = (direction, h, size) => {
    const glow = direction.clone().multiplyScalar(RADIUS + h + 0.22 * size);
    glowPositions.push(glow.x, glow.y, glow.z);
    glowSizes.push(size * (0.85 + random() * 0.35));
    glowPhases.push(random() * TAU);
  };

  // Conifers: trunk + two foliage cones merged into one geometry → one draw call.
  const coniferCount = isCompact ? 480 : 1550;
  const coniferTrunk = new THREE.CylinderGeometry(0.012, 0.019, 0.13, 5);
  coniferTrunk.translate(0, 0.067, 0);
  const coniferFoliage = new THREE.ConeGeometry(0.072, 0.19, 5);
  coniferFoliage.translate(0, 0.18, 0);
  const coniferCrown = new THREE.ConeGeometry(0.05, 0.16, 5);
  coniferCrown.translate(0, 0.265, 0);
  const coniferGeometry = mergeParts([
    paint(coniferTrunk.toNonIndexed(), 0x3d5253),
    paint(coniferFoliage.toNonIndexed(), 0x7fc7a4),
    paint(coniferCrown.toNonIndexed(), 0x96decb)
  ]);
  const conifers = new THREE.InstancedMesh(
    coniferGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x10524d, emissiveIntensity: 0.95, roughness: 0.82, flatShading: true }),
    coniferCount
  );
  conifers.frustumCulled = false;
  const treeTints = [new THREE.Color('#baf3d9'), new THREE.Color('#7fe2ce'), new THREE.Color('#b5d9e3'), new THREE.Color('#a4edbd')];
  let planted = 0, attempts = 0;
  while (planted < coniferCount && attempts++ < coniferCount * 55) {
    const direction = randomDirection(), h = heightAt(direction);
    if (h < 0.055 || h > 0.32 || direction.dot(firstLanding) > 0.9982 || direction.dot(primaryRuinDirection) > 0.9985) continue;
    if (noise3(direction.x * 11 + 32, direction.y * 11 - 19, direction.z * 11 + 3) < -0.16) continue;
    const size = 0.67 + random() * 0.9;
    dummy.position.copy(direction).multiplyScalar(RADIUS + h - 0.006);
    dummy.quaternion.setFromUnitVectors(Y_AXIS, direction);
    dummy.rotateY(random() * TAU);
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    conifers.setMatrixAt(planted, dummy.matrix);
    conifers.setColorAt(planted, treeTints[Math.floor(random() * treeTints.length)]);
    if (random() > 0.23) pushGlow(direction, h, size);
    planted++;
  }
  conifers.count = planted;
  conifers.instanceMatrix.needsUpdate = true;
  if (conifers.instanceColor) conifers.instanceColor.needsUpdate = true;
  scene.add(conifers);
  instanced.push({ mesh: conifers, base: planted });

  // Broad-leafed canopy trees: trunk + icosahedron crown → one draw call.
  const broadleafCount = isCompact ? 230 : 650;
  const broadleafTrunk = new THREE.CylinderGeometry(0.013, 0.024, 0.21, 5);
  broadleafTrunk.translate(0, 0.105, 0);
  const broadleafCrown = new THREE.IcosahedronGeometry(0.11, 0);
  broadleafCrown.scale(1, 1.14, 1);
  broadleafCrown.translate(0, 0.255, 0);
  const broadleafGeometry = mergeParts([
    paint(broadleafTrunk.toNonIndexed(), 0x3a5052),
    paint(broadleafCrown, 0x95d8b8)
  ]);
  const broadleaves = new THREE.InstancedMesh(
    broadleafGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x14645f, emissiveIntensity: 0.8, roughness: 0.87, flatShading: true }),
    broadleafCount
  );
  broadleaves.frustumCulled = false;
  const broadleafTints = [new THREE.Color('#d7eebe'), new THREE.Color('#99e3c3'), new THREE.Color('#78c7bd'), new THREE.Color('#c2e2cb')];
  let broadleafPlaced = 0, broadleafAttempts = 0;
  while (broadleafPlaced < broadleafCount && broadleafAttempts++ < broadleafCount * 55) {
    const nearLanding = broadleafPlaced < (isCompact ? 26 : 64);
    const direction = nearLanding ? nearbyDirection(0.055, 0.16) : randomDirection();
    const h = heightAt(direction);
    if (h < 0.05 || h > 0.34 || direction.dot(firstLanding) > 0.9982) continue;
    if (direction.dot(primaryRuinDirection) > 0.997) continue;
    if (noise3(direction.x * 9 - 17, direction.y * 9 + 28, direction.z * 9 + 6) < -0.13) continue;
    const size = nearLanding ? 1.22 + random() * 0.72 : 0.64 + random() * 0.68;
    dummy.position.copy(direction).multiplyScalar(RADIUS + h - 0.012);
    dummy.quaternion.setFromUnitVectors(Y_AXIS, direction);
    dummy.rotateY(random() * TAU);
    dummy.scale.set(size, size * (0.9 + random() * 0.25), size);
    dummy.updateMatrix();
    broadleaves.setMatrixAt(broadleafPlaced, dummy.matrix);
    broadleaves.setColorAt(broadleafPlaced, broadleafTints[Math.floor(random() * broadleafTints.length)]);
    const glow = direction.clone().multiplyScalar(RADIUS + h + 0.28 * size);
    glowPositions.push(glow.x, glow.y, glow.z);
    glowSizes.push(size * (1.05 + random() * 0.25));
    glowPhases.push(random() * TAU);
    broadleafPlaced++;
  }
  broadleaves.count = broadleafPlaced;
  broadleaves.instanceMatrix.needsUpdate = true;
  if (broadleaves.instanceColor) broadleaves.instanceColor.needsUpdate = true;
  scene.add(broadleaves);
  instanced.push({ mesh: broadleaves, base: broadleafPlaced });

  // Luminous spires seem to grow where forest moisture gathers.
  const crystalCount = isCompact ? 180 : 460;
  const crystalGeometry = new THREE.ConeGeometry(0.015, 0.13, 5);
  crystalGeometry.translate(0, 0.065, 0);
  const crystals = new THREE.InstancedMesh(
    crystalGeometry,
    new THREE.MeshStandardMaterial({ color: 0x93f5df, emissive: 0x2ee9ce, emissiveIntensity: 1.55, roughness: 0.35, metalness: 0.15, flatShading: true }),
    crystalCount
  );
  crystals.frustumCulled = false;
  let crystalPlaced = 0, crystalAttempts = 0;
  while (crystalPlaced < crystalCount && crystalAttempts++ < crystalCount * 55) {
    const nearLanding = crystalPlaced < (isCompact ? 12 : 24);
    const direction = nearLanding ? nearbyDirection(0.07, 0.2) : randomDirection();
    const h = heightAt(direction);
    if (h < 0.045 || h > 0.45 || direction.dot(firstLanding) > 0.9982) continue;
    const size = nearLanding ? 1.8 + random() * 1.6 : 0.5 + random() * 0.8;
    dummy.position.copy(direction).multiplyScalar(RADIUS + h - 0.01);
    dummy.quaternion.setFromUnitVectors(Y_AXIS, direction);
    dummy.rotateY(random() * TAU);
    dummy.rotateX((random() - 0.5) * 0.2);
    dummy.scale.set(0.7 + random() * 0.7, size, 0.7 + random() * 0.7);
    dummy.updateMatrix();
    crystals.setMatrixAt(crystalPlaced, dummy.matrix);
    if (crystalPlaced % 2 === 0) {
      const glow = direction.clone().multiplyScalar(RADIUS + h + 0.13 * size);
      glowPositions.push(glow.x, glow.y, glow.z);
      glowSizes.push(size * 0.72);
      glowPhases.push(random() * TAU);
    }
    crystalPlaced++;
  }
  crystals.count = crystalPlaced;
  crystals.instanceMatrix.needsUpdate = true;
  scene.add(crystals);
  instanced.push({ mesh: crystals, base: crystalPlaced });

  const rockCount = isCompact ? 110 : 340;
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.065, 0),
    new THREE.MeshStandardMaterial({ color: 0x85989a, roughness: 0.94, flatShading: true }),
    rockCount
  );
  rocks.frustumCulled = false;
  let placedRocks = 0, rockAttempts = 0;
  while (placedRocks < rockCount && rockAttempts++ < rockCount * 55) {
    const direction = randomDirection(), h = heightAt(direction);
    if (h < 0.13 || h > 0.55) continue;
    dummy.position.copy(direction).multiplyScalar(RADIUS + h + 0.018);
    dummy.quaternion.setFromUnitVectors(Y_AXIS, direction);
    dummy.rotateY(random() * TAU);
    dummy.scale.set(0.6 + random() * 1.1, 1 + random() * 2.4, 0.6 + random() * 0.8);
    dummy.updateMatrix();
    rocks.setMatrixAt(placedRocks++, dummy.matrix);
  }
  rocks.count = placedRocks;
  rocks.instanceMatrix.needsUpdate = true;
  scene.add(rocks);
  instanced.push({ mesh: rocks, base: placedRocks });

  // Every forest spark shares one shader draw.
  const glowGeometry = new THREE.BufferGeometry();
  glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
  glowGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(glowSizes, 1));
  glowGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(glowPhases, 1));
  const glowUniforms = { uSun: { value: sunDirection }, uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } };
  const forestGlows = new THREE.Points(glowGeometry, new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      uniform vec3 uSun;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vStrength;
      void main() {
        float night = 1.0 - smoothstep(-0.2, 0.45, dot(normalize(position), uSun));
        vStrength = (0.25 + night * 0.75) * (0.83 + 0.17 * sin(uTime * 2.0 + aPhase));
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(28.0 * uPixelRatio, aSize * 27.0 * uPixelRatio / max(0.5, -viewPosition.z));
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying float vStrength;
      void main() {
        float distanceFromCenter = length(gl_PointCoord - 0.5) * 2.0;
        float alpha = pow(max(0.0, 1.0 - distanceFromCenter), 2.0) * vStrength * 0.74;
        gl_FragColor = vec4(0.25, 0.95, 0.82, alpha);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  forestGlows.frustumCulled = false;
  scene.add(forestGlows);

  return { instanced, glowUniforms, glowPoints: forestGlows };
}
