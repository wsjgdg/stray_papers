import * as THREE from 'three';
import { isCompact, basePixelRatio, sunDirection, createSite, INITIAL_YAW, INITIAL_POLAR } from './core.js';
import { buildPlanet } from './planet.js';
import { buildSky } from './sky.js';
import { buildFlora } from './flora.js';
import { buildRuins } from './ruins.js';
import { createPlayer } from './player.js';
import { createAdaptiveQuality } from './quality.js';

const sceneElement = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !isCompact, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(basePixelRatio(window.innerWidth, window.innerHeight));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.24;
renderer.domElement.setAttribute('aria-label', 'Explore the planet with mouse or touch');
sceneElement.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(window.innerWidth / window.innerHeight < 0.76 ? 61 : 50, window.innerWidth / window.innerHeight, 0.025, 250);
const scene = new THREE.Scene();
const clock = new THREE.Clock();

const site = createSite(INITIAL_YAW, INITIAL_POLAR);
const planet = buildPlanet(scene);
const sky = buildSky(scene);
const flora = buildFlora(scene, site, renderer.getPixelRatio());
const ruins = buildRuins(scene, site);
const player = createPlayer({
  camera,
  canvas: renderer.domElement,
  site,
  ruins: ruins.items,
  onShiftLight: sky.shiftLight,
  onModeChange: (mode) => {
    document.body.dataset.mode = mode;
    document.getElementById('modeNumber').textContent = mode === 'orbit' ? '01' : '02';
    document.getElementById('modeName').textContent = mode === 'orbit' ? 'ORBIT / FLYING' : 'SURFACE / WALKING';
  }
});
const quality = createAdaptiveQuality({
  renderer,
  glowUniforms: flora.glowUniforms,
  instanced: flora.instanced,
  cloudHigh: planet.cloudHigh,
  onTier: (name) => { document.getElementById('qualityStatus').textContent = name; }
});

document.getElementById('descendButton').addEventListener('click', player.switchMode);
document.getElementById('switchButton').addEventListener('click', player.switchMode);
document.getElementById('lightButton').addEventListener('click', sky.shiftLight);
document.getElementById('mobileLightButton').addEventListener('click', sky.shiftLight);
document.getElementById('zoomIn').addEventListener('click', () => player.zoom(0.8));
document.getElementById('zoomOut').addEventListener('click', () => player.zoom(1.25));
document.getElementById('jumpButton').addEventListener('pointerdown', (event) => { event.preventDefault(); player.jump(); });

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  player.onResize(width, height);
  quality.onResize(width, height);
}
window.addEventListener('resize', resize);

player.snap();
const viewDirection = new THREE.Vector3();
let lastLightLabel = '';

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  sky.update(dt);
  planet.oceanUniforms.uTime.value = elapsed;
  flora.glowUniforms.uTime.value = elapsed;
  planet.cloudLow.rotation.y = elapsed * 0.012;
  planet.cloudHigh.rotation.y = 1.8 - elapsed * 0.008;
  ruins.update(elapsed);
  player.update(dt, elapsed);

  const desiredFov = player.state.mode === 'ground' ? 71 : window.innerWidth / window.innerHeight < 0.76 ? 61 : 50;
  if (Math.abs(camera.fov - desiredFov) > 0.015) {
    camera.fov += (desiredFov - camera.fov) * (1 - Math.exp(-dt * 3.5));
    camera.updateProjectionMatrix();
  }

  quality.update(dt);

  player.viewDirection(viewDirection);
  const daylight = viewDirection.dot(sunDirection);
  const label = daylight > 0.33 ? 'DAYLIGHT CYCLE' : daylight > -0.18 ? 'GOLDEN TWILIGHT' : 'NIGHTFALL CYCLE';
  if (label !== lastLightLabel) {
    document.getElementById('lightStatus').textContent = label;
    lastLightLabel = label;
  }

  renderer.render(scene, camera);
});
