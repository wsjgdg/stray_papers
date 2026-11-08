import * as THREE from 'three';
import { TAU, isCompact, sunDirection, moonDirection, random, randomDirection, noise3, clamp } from './core.js';

function skyGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const glow = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,255,242,1)');
  glow.addColorStop(0.11, 'rgba(255,236,184,0.9)');
  glow.addColorStop(0.3, 'rgba(217,240,223,0.25)');
  glow.addColorStop(1, 'rgba(151,226,216,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function moonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d');
  const image = context.createImageData(256, 128);
  for (let y = 0; y < 128; y++) {
    const lat = (0.5 - (y + 0.5) / 128) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    for (let x = 0; x < 256; x++) {
      const lon = (x / 256) * TAU;
      const nx = Math.cos(lon) * cosLat, ny = sinLat, nz = Math.sin(lon) * cosLat;
      const maria = noise3(nx * 2.2 + 8, ny * 2.2 - 3, nz * 2.2 + 7);
      const speckle = noise3(nx * 18 - 4, ny * 18 + 11, nz * 18 + 2);
      const crater = Math.max(0, noise3(nx * 7 + 21, ny * 7 - 17, nz * 7 + 1)) * 0.1;
      const shade = clamp(0.72 + maria * 0.14 + speckle * 0.07 - crater, 0.42, 1);
      const p = (y * 256 + x) * 4;
      image.data[p] = 199 * shade;
      image.data[p + 1] = 207 * shade;
      image.data[p + 2] = 198 * shade;
      image.data[p + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export function buildSky(scene) {
  scene.add(new THREE.HemisphereLight(0x91c5d7, 0x142c39, 0.44));
  const sunlight = new THREE.DirectionalLight(0xffedce, 2.55);
  sunlight.position.copy(sunDirection).multiplyScalar(25);
  scene.add(sunlight);
  const moonlight = new THREE.DirectionalLight(0x83b9cd, 0.72);
  moonlight.position.copy(moonDirection).multiplyScalar(22);
  scene.add(moonlight);

  const starCount = isCompact ? 850 : 1900;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const direction = randomDirection(), distance = 90 + random() * 60;
    starPositions.set([direction.x * distance, direction.y * distance, direction.z * distance], i * 3);
    const tint = random();
    starColors.set(tint < 0.32 ? [0.47, 0.7, 0.9] : tint < 0.65 ? [0.78, 0.87, 1] : [1, 0.91, 0.76], i * 3);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ size: isCompact ? 1.25 : 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.76, depthWrite: false }));
  stars.matrixAutoUpdate = false;
  scene.add(stars);

  const skyGlow = skyGlowTexture();
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: skyGlow, color: 0xffe8bb, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunHalo.scale.set(7.5, 7.5, 1);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: skyGlow, color: 0xfff9e7, transparent: true, opacity: 0.97, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunCore.scale.set(1.65, 1.65, 1);
  scene.add(sunHalo, sunCore);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.74, isCompact ? 24 : 40, isCompact ? 16 : 28),
    new THREE.MeshStandardMaterial({ map: moonTexture(), color: 0xd9e1d9, roughness: 1, metalness: 0 })
  );
  moon.position.copy(moonDirection).multiplyScalar(26);
  scene.add(moon);
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: skyGlow, color: 0x91bfd2, transparent: true, opacity: 0.19, depthWrite: false, blending: THREE.AdditiveBlending }));
  moonHalo.position.copy(moon.position);
  moonHalo.scale.set(3.4, 3.4, 1);
  scene.add(moonHalo);

  const state = { solarTime: 0, solarOffset: 0, solarTarget: 0 };

  function update(dt) {
    state.solarTime += dt;
    state.solarOffset += (state.solarTarget - state.solarOffset) * (1 - Math.exp(-dt * 1.7));
    const solarAngle = -1.05 + state.solarTime * TAU / 145 + state.solarOffset;
    sunDirection.set(Math.sin(solarAngle), 0.39 + Math.sin(solarAngle * 0.58) * 0.08, Math.cos(solarAngle)).normalize();
    sunlight.position.copy(sunDirection).multiplyScalar(25);
    const moonAngle = 2.15 + state.solarTime * TAU / 220;
    moonDirection.set(Math.cos(moonAngle) * 0.92, 0.3 + Math.sin(moonAngle * 0.7) * 0.08, Math.sin(moonAngle) * 0.92).normalize();
    moon.position.copy(moonDirection).multiplyScalar(26);
    moonHalo.position.copy(moon.position);
    moonlight.position.copy(moonDirection).multiplyScalar(22);
    sunHalo.position.copy(sunDirection).multiplyScalar(60);
    sunCore.position.copy(sunHalo.position);
  }

  function shiftLight() { state.solarTarget += Math.PI; }

  return { state, update, shiftLight };
}
