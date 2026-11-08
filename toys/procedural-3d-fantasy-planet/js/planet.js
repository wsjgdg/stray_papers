import * as THREE from 'three';
import { RADIUS, SEA_LEVEL, SEA_RADIUS, TAU, isCompact, sunDirection, noise3, heightAt, clamp, mix, smoothstep, terrainColor } from './core.js';

function oceanTexture() {
  const width = isCompact ? 200 : 400, height = isCompact ? 100 : 200;
  const land = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      // Match SphereGeometry's UV orientation exactly so shallows sit on real coastlines.
      const lon = Math.PI - ((x + 0.5) / width) * TAU;
      land[y * width + x] = heightAt(new THREE.Vector3(Math.cos(lon) * cosLat, sinLat, Math.sin(lon) * cosLat)) > SEA_LEVEL ? 1 : 0;
    }
  }
  function blurredLand(radius) {
    const horizontal = new Float32Array(width * height);
    const result = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let total = 0;
        for (let offset = -radius; offset <= radius; offset++) total += land[y * width + (x + offset + width) % width];
        horizontal[y * width + x] = total / (radius * 2 + 1);
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let total = 0;
        for (let offset = -radius; offset <= radius; offset++) total += horizontal[clamp(y + offset, 0, height - 1) * width + x];
        result[y * width + x] = total / (radius * 2 + 1);
      }
    }
    return result;
  }
  const shore = blurredLand(Math.max(1, Math.round(width * 0.009)));
  const shelf = blurredLand(Math.max(2, Math.round(width * 0.023)));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let i = 0; i < land.length; i++) {
    const exposed = land[i];
    const shallow = clamp(shore[i] * 1.55 + shelf[i] * 0.32, 0, 1);
    const current = Math.sin(((i % width) / width) * TAU * 7 + (Math.floor(i / width) / height) * TAU * 3) * 0.5 + 0.5;
    const r = mix(8, 60, shallow) + current * shallow * 5;
    const g = mix(36, 174, shallow) + current * shallow * 9;
    const b = mix(59, 165, shallow) + current * shelf[i] * 4;
    const p = i * 4;
    image.data[p] = exposed ? 9 : r;
    image.data[p + 1] = exposed ? 40 : g;
    image.data[p + 2] = exposed ? 62 : b;
    image.data[p + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 2;
  return texture;
}

function cloudTexture(width, height, offset) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    const cosLat = Math.cos(lat), sinLat = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const lon = (x / width - 0.5) * TAU;
      const nx = Math.cos(lon) * cosLat, ny = sinLat, nz = Math.sin(lon) * cosLat;
      const cloud = noise3(nx * 3.4 + offset, ny * 3.4 + 4, nz * 3.4 - 3) * 0.63
        + noise3(nx * 7.2 - 6, ny * 7.2 + offset, nz * 7.2 + 8) * 0.29
        + noise3(nx * 14.5 + 2, ny * 14.5 + 5, nz * 14.5 + offset) * 0.12;
      const alpha = smoothstep(0.055, 0.29, cloud) * 220;
      const p = (y * width + x) * 4;
      image.data[p] = 220; image.data[p + 1] = 239; image.data[p + 2] = 241; image.data[p + 3] = alpha;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 2;
  return texture;
}

function atmosphere(radius, strength, side) {
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, isCompact ? 64 : 96, isCompact ? 40 : 64),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDirection }, uStrength: { value: strength } },
      vertexShader: `
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSun;
        uniform float uStrength;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        void main() {
          vec3 n = normalize(vNormalWorld);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float edge = pow(1.0 - abs(dot(n, viewDirection)), 2.2);
          float daylight = smoothstep(-0.45, 0.7, dot(n, uSun));
          vec3 color = mix(vec3(0.10, 0.32, 0.66), vec3(0.25, 0.79, 0.87), daylight);
          gl_FragColor = vec4(color, edge * uStrength * (0.38 + daylight * 0.62));
        }
      `,
      transparent: true, side, depthWrite: false, blending: THREE.AdditiveBlending
    })
  );
  shell.matrixAutoUpdate = false;
  return shell;
}

export function buildPlanet(scene) {
  const terrainGeometry = new THREE.SphereGeometry(RADIUS, isCompact ? 128 : 224, isCompact ? 80 : 144);
  const terrainPositions = terrainGeometry.attributes.position;
  const terrainHeights = new Float32Array(terrainPositions.count);
  const terrainDirections = new Float32Array(terrainPositions.count * 3);
  const terrainColors = new Float32Array(terrainPositions.count * 3);
  for (let i = 0; i < terrainPositions.count; i++) {
    const n = new THREE.Vector3().fromBufferAttribute(terrainPositions, i).normalize();
    const h = heightAt(n);
    terrainHeights[i] = h;
    terrainDirections.set([n.x, n.y, n.z], i * 3);
    terrainPositions.setXYZ(i, n.x * (RADIUS + h), n.y * (RADIUS + h), n.z * (RADIUS + h));
    const color = terrainColor(n, h);
    terrainColors.set([color.r, color.g, color.b], i * 3);
  }
  terrainPositions.needsUpdate = true;
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.02, emissive: 0x061c17, emissiveIntensity: 0.5 }));
  terrain.matrixAutoUpdate = false;
  scene.add(terrain);

  const oceanUniforms = { uSun: { value: sunDirection }, uTime: { value: 0 }, uOceanMap: { value: oceanTexture() } };
  const ocean = new THREE.Mesh(
    new THREE.SphereGeometry(SEA_RADIUS, isCompact ? 80 : 128, isCompact ? 48 : 80),
    new THREE.ShaderMaterial({
      uniforms: oceanUniforms,
      vertexShader: `
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSun;
        uniform float uTime;
        uniform sampler2D uOceanMap;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        void main() {
          vec3 normal = normalize(vNormalWorld);
          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float day = smoothstep(-0.58, 0.72, dot(normal, uSun));
          float wave = sin(vWorldPosition.x * 33.0 + uTime * 0.85) * sin(vWorldPosition.z * 28.0 - uTime * 0.62);
          vec3 waveNormal = normalize(normal + vec3(wave * 0.009, sin(vWorldPosition.y * 38.0 + uTime) * 0.007, wave * 0.006));
          float glint = pow(max(dot(reflect(-uSun, waveNormal), viewDirection), 0.0), 92.0) * day;
          float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 3.0);
          vec3 color = texture2D(uOceanMap, vUv).rgb * (0.2 + day * 0.95);
          color += vec3(0.018, 0.08, 0.11) * day;
          color += vec3(0.03, 0.14, 0.17) * max(wave, 0.0) * day * 0.2;
          color += vec3(0.62, 0.93, 0.95) * glint * 0.9;
          color += vec3(0.10, 0.39, 0.51) * fresnel * (0.24 + day * 0.5);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    })
  );
  ocean.matrixAutoUpdate = false;
  scene.add(ocean);

  // A fine coastline follows the exact sea-level intersections of the terrain triangles.
  const shorePositions = [];
  const indices = terrainGeometry.index.array;
  function shoreCross(a, b) {
    const t = (SEA_LEVEL - terrainHeights[a]) / (terrainHeights[b] - terrainHeights[a]);
    const ai = a * 3, bi = b * 3;
    const x = mix(terrainDirections[ai], terrainDirections[bi], t);
    const y = mix(terrainDirections[ai + 1], terrainDirections[bi + 1], t);
    const z = mix(terrainDirections[ai + 2], terrainDirections[bi + 2], t);
    const factor = (SEA_RADIUS + 0.009) / Math.hypot(x, y, z);
    return [x * factor, y * factor, z * factor];
  }
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    const crossings = [];
    for (let e = 0; e < 3; e++) {
      const a = triangle[e], b = triangle[(e + 1) % 3];
      if ((terrainHeights[a] > SEA_LEVEL) !== (terrainHeights[b] > SEA_LEVEL)) crossings.push(shoreCross(a, b));
    }
    if (crossings.length === 2) shorePositions.push(...crossings[0], ...crossings[1]);
  }
  const shoreGeometry = new THREE.BufferGeometry();
  shoreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shorePositions, 3));
  const shore = new THREE.LineSegments(shoreGeometry, new THREE.LineBasicMaterial({ color: 0xace9d9, transparent: true, opacity: 0.38, depthWrite: false }));
  shore.matrixAutoUpdate = false;
  scene.add(shore);

  let sampledPeak = SEA_LEVEL;
  for (let i = 0; i < terrainHeights.length; i += 5) sampledPeak = Math.max(sampledPeak, terrainHeights[i]);
  const cloudAltitude = Math.max(0.36, sampledPeak + 0.16);
  const upperCloudAltitude = cloudAltitude + 0.085;
  const cloudLow = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS + cloudAltitude, isCompact ? 64 : 96, isCompact ? 40 : 64),
    new THREE.MeshPhongMaterial({ map: cloudTexture(isCompact ? 256 : 512, isCompact ? 128 : 256, 13), color: 0xe9faff, transparent: true, opacity: 0.68, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, shininess: 10 })
  );
  const cloudHigh = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS + upperCloudAltitude, isCompact ? 56 : 80, isCompact ? 36 : 52),
    new THREE.MeshPhongMaterial({ map: cloudTexture(isCompact ? 192 : 384, isCompact ? 96 : 192, 31), color: 0xb9dce8, transparent: true, opacity: 0.27, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, shininess: 5 })
  );
  cloudHigh.rotation.y = 1.8;
  scene.add(cloudLow, cloudHigh);

  scene.add(atmosphere(RADIUS + 0.55, 0.5, THREE.BackSide));
  scene.add(atmosphere(RADIUS + 0.37, 0.17, THREE.FrontSide));

  return { terrain, ocean, oceanUniforms, cloudLow, cloudHigh, cloudAltitude };
}
