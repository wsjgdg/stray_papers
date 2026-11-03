// The world-construction bench. The sims that need a world — collision, the herd, the water, the towns —
// cannot get one by pulling a single function out of the page, because the page builds the world inside one
// seven-thousand-line function that also opens a WebGL context.
//
// So this does not extract anything. It runs the page's own module, whole, with the browser replaced by
// stubs and `THREE.WebGLRenderer` swapped for a recorder that draws nothing. Everything above the renderer
// — the noise, the terrain, the towns, the animals, the physics — is the shipped code, at the shipped
// seeds, which is the only version of "the world" worth testing.
//
// It lives in the repository on purpose. The first version lived outside it and a sandbox reset took it,
// along with every sim built on it; the page survived because the page is committed.
import fs from 'fs';
import * as THREE_REAL from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const PAGE = process.env.PAGE || new URL('../index.html', import.meta.url).pathname;

// ---- a canvas that remembers nothing -------------------------------------------------------------------
const makeGradient = () => ({ addColorStop() {} });
const makeContext2D = canvas => {
  const ctx = {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none',
    shadowBlur: 0, shadowColor: 'transparent', imageSmoothingEnabled: true,
    createLinearGradient: makeGradient, createRadialGradient: makeGradient, createPattern: () => ({}),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getImageData: (x, y, w, h) => {
      // Deterministic noise rather than zeroes: a texture that reads back flat black makes code above it
      // divide by zero, and then the failure looks like a bug in the page instead of a bug in the bench.
      const data = new Uint8ClampedArray(w * h * 4);
      let s = (x * 73856093 ^ y * 19349663 ^ w * 83492791) >>> 0 || 1;
      for (let i = 0; i < data.length; i += 4) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const v = s >>> 24;
        data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
      }
      return { width: w, height: h, data };
    },
    putImageData() {}, drawImage() {}, clearRect() {}, fillRect() {}, strokeRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, ellipse() {},
    rect() {}, roundRect() {}, quadraticCurveTo() {}, bezierCurveTo() {}, fill() {}, stroke() {}, clip() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {}, resetTransform() {},
    setLineDash() {}, getLineDash: () => [], fillText() {}, strokeText() {},
    measureText: text => ({ width: String(text).length * 6, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
  };
  return ctx;
};

// ---- elements ------------------------------------------------------------------------------------------
const elements = new Map();
const makeElement = (tag = 'div') => {
  const el = {
    tagName: String(tag).toUpperCase(),
    style: new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'setProperty' ? () => {} : '')), set: (t, k, v) => { t[k] = v; return true; } }),
    dataset: {}, children: [], parentNode: null, hidden: false, disabled: false,
    textContent: '', innerHTML: '', innerText: '', value: '', id: '', className: '',
    width: 0, height: 0, clientWidth: 1280, clientHeight: 720, offsetWidth: 1280, offsetHeight: 720,
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, on) { const has = this._s.has(c); const want = on === undefined ? !has : on; if (want) this._s.add(c); else this._s.delete(c); return want; }, contains(c) { return this._s.has(c); } },
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    removeAttribute(k) { delete this.attributes[k]; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    append(...kids) { this.children.push(...kids); return this; },
    prepend(...kids) { this.children.unshift(...kids); return this; },
    insertBefore(child) { this.children.unshift(child); child.parentNode = this; return child; },
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); return child; },
    replaceChildren(...kids) { this.children = kids; },
    after() {}, before() {}, replaceWith() {},
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get childNodes() { return this.children; },
    get nextSibling() { return null; },
    contains: () => false,
    cloneNode() { return makeElement(this.tagName.toLowerCase()); },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, remove() {},
    querySelector(selector) { if (selector === 'em' && this.innerHTML.includes('<em')) return (this._em ||= makeElement('em')); return null; },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 1280, height: 720, top: 0, left: 0, right: 1280, bottom: 720 }),
    getContext(type) {
      if (String(type).startsWith('2d')) { this._ctx ||= makeContext2D(this); return this._ctx; }
      // The page's first act is to probe for WebGL2 and refuse to start without it. Nothing downstream
      // touches the context — the renderer is a recorder — so the probe only needs to answer.
      if (String(type).startsWith('webgl')) return { getExtension: () => null, getParameter: () => 'node-bench', getContextAttributes: () => ({}) };
      return null;
    },
    toDataURL: () => 'data:image/png;base64,',
    requestPointerLock() {}, releasePointerLock() {},
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    animate: () => ({ finished: Promise.resolve(), cancel() {}, play() {}, pause() {} })
  };
  return el;
};

const documentStub = {
  createElement(tag) { const el = makeElement(tag); if (String(tag).toLowerCase() === 'canvas') { el.width = 512; el.height = 512; } return el; },
  createElementNS(ns, tag) { return makeElement(tag); },
  createTextNode: text => ({ nodeValue: String(text) }),
  getElementById(id) { if (!elements.has(id)) { const el = makeElement('div'); el.id = id; elements.set(id, el); } return elements.get(id); },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  body: makeElement('body'),
  documentElement: makeElement('html'),
  head: makeElement('head'),
  fonts: { add() {}, ready: Promise.resolve(), load: () => Promise.resolve([]) },
  hidden: false, visibilityState: 'visible', pointerLockElement: null,
  exitPointerLock() {}, exitFullscreen() {}, fullscreenElement: null,
  hasFocus: () => true, activeElement: null
};

const windowStub = {
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {},
  matchMedia: q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  localStorage: { _m: new Map(), getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } },
  location: { href: 'http://localhost/', search: '', hash: '' },
  requestAnimationFrame: cb => setTimeout(() => cb(performance.now()), 0),
  cancelAnimationFrame: id => clearTimeout(id),
  performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
  navigator: { maxTouchPoints: 0, userAgent: 'node-bench', hardwareConcurrency: 8 },
  setTimeout, clearTimeout, setInterval, clearInterval
};

// ---- a renderer that draws nothing and remembers what it was asked to draw ------------------------------
class RecorderRenderer {
  constructor() {
    this.domElement = makeElement('canvas');
    this.shadowMap = { enabled: false, type: 0, autoUpdate: true, needsUpdate: false };
    this.capabilities = { getMaxAnisotropy: () => 8, isWebGL2: true };
    this.info = { render: { calls: 0, triangles: 0 }, memory: {}, autoReset: true };
    this.debug = { checkShaderErrors: false, onShaderError: null };
    this._pixelRatio = 1;
    this.outputColorSpace = ''; this.toneMapping = 0; this.toneMappingExposure = 1;
  }
  setSize() {} setPixelRatio(v) { this._pixelRatio = v; } getPixelRatio() { return this._pixelRatio; }
  setClearColor() {} setAnimationLoop() {} render() { this.info.render.calls++; }
  async compileAsync() {} compile() {} dispose() {} getContext() { return null; }
  setRenderTarget() {} clear() {} getRenderTarget() { return null; }
}
class RecorderPMREM {
  fromScene() { return { texture: new THREE_REAL.Texture() }; }
  fromEquirectangular() { return { texture: new THREE_REAL.Texture() }; }
  dispose() {}
}

const THREE = Object.assign(Object.create(null), THREE_REAL, {
  WebGLRenderer: RecorderRenderer,
  PMREMGenerator: RecorderPMREM
});

// ---- the handful of browser globals the page reads bare ------------------------------------------------
// Everything else it reaches through `window`/`document`, which are stubs; these are the ones a browser
// would have put in scope without asking.
globalThis.innerWidth = windowStub.innerWidth;
globalThis.innerHeight = windowStub.innerHeight;
globalThis.devicePixelRatio = windowStub.devicePixelRatio;
globalThis.matchMedia = windowStub.matchMedia;
globalThis.localStorage = windowStub.localStorage;
globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };

// ---- the page, whole -----------------------------------------------------------------------------------
export function loadPage(file = PAGE) {
  const html = fs.readFileSync(file, 'utf8');
  const open = html.indexOf('<script type="module">');
  const close = html.indexOf('</script>', open);
  let body = html.slice(open + '<script type="module">'.length, close);
  // Renamed on the way in: `bootstrap` declares its own `const [THREE, ...]`, so injecting a parameter
  // called THREE puts the page's own module body in a temporal dead zone.
  body = body.replace("import('three')", 'Promise.resolve(__THREE)')
    .replace("import('three/addons/utils/BufferGeometryUtils.js')", 'Promise.resolve(__GEOMETRY_UTILS)')
    .replace("import('three/addons/geometries/RoundedBoxGeometry.js')", 'Promise.resolve(__ROUNDED_BOX)');
  // Hand the bench the world on the way out: everything below is the page's own, at the page's own seeds.
  const endOfStartWorld = findClosingBrace(body, body.indexOf('async function startWorld('));
  const expose = `
      globalThis.__world = {
        THREE, scene, camera, renderer, state,
        R, SEA, WATER, TAU, EYE, WALKER_RADIUS, WALK_SPEED, SPRINT_SPEED, SWIM_SPEED,
        DIVE_SPEED, RISE_SPEED, MAX_DIVE, SWIM_EYE, CROUCH_EYE,
        BELL_SIZE, REEF_S, BELL_HALF_WIDE, BELL_BODY_TOP, keys, joystick, stoneSolids, groundPose, dwFeet,
        heightAt, provinceAt, biomeAt, nearestLand, landing, seeded, hash, noise, waterAt, depthMeters,
        provinceDressing, physicsStep, updateBell, updateReefs, updateCamera, updateWorld, updateWeather, updateLattice,
        CODEX, codexScan, codexHTML, inSight, flockWorld, archiveChip, modeLabel, setArchive, eventFx, triggerEvent, sun,
        getCodexHTML: () => document.getElementById('codexSection').innerHTML,
        teleportTo, mapAnchors, rebaseFrameClock: typeof rebaseFrameClock === 'undefined' ? null : rebaseFrameClock,
        // Run the page's frame order and clock without requiring a drawing GPU.
        advanceFrame: dt => { elapsed += dt; frame++; updateCamera(dt); updateWorld(dt); },
        get elapsed() { return elapsed; }, get frame() { return frame; },
        setAudioContext: Ctx => { window.AudioContext = Ctx; }, toggleSound, getAudio: () => audio,
        bell, reefs, landmarks, settlementDirs, walkBoxes, hardProps, floraHard, groundStones,
        provinceGeo, provinceMat, hardBand, hardWidthOf, provinceWet, smokeWind, overlapAt,
        fern, fernLandingExtent: typeof fernLandingExtent === 'undefined' ? null : fernLandingExtent, dressFerns,
        weather, latticeRings, setWeather, cycleWeather, WEATHER_DEFS, nextStrikeGap, thunderPlan, beginStrike,
        resetGroundMotion, clearInput, switchMode, propUnder, hardBand, BELL_HALF_WIDE, propAhead, bellNormal,
        refreshBellProps, dressStones
      };
`;
  body = body.slice(0, endOfStartWorld) + expose + body.slice(endOfStartWorld);

  // The page ends with a top-level `await bootstrap()`, so the body has to be compiled as an async function.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const factory = new AsyncFunction('__THREE', '__GEOMETRY_UTILS', '__ROUNDED_BOX', 'document', 'window', 'navigator',
    'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'matchMedia', 'localStorage',
    'ResizeObserver', 'IntersectionObserver', 'Image', 'AudioContext', 'getComputedStyle', 'HTMLElement',
    body + '\nglobalThis.__startup = startup;\nreturn globalThis.__world;');
  return factory(THREE, { mergeGeometries, mergeVertices }, { RoundedBoxGeometry },
    documentStub, windowStub, windowStub.navigator,
    windowStub.requestAnimationFrame, windowStub.cancelAnimationFrame, windowStub.performance,
    windowStub.matchMedia, windowStub.localStorage,
    class { observe() {} unobserve() {} disconnect() {} },
    class { observe() {} unobserve() {} disconnect() {} },
    class { constructor() { this.width = 8; this.height = 8; } },
    undefined, () => ({ getPropertyValue: () => '' }), class {});
}

function findClosingBrace(text, from) {
  // The signature has a brace in it — `startWorld(THREE, { mergeGeometries, mergeVertices }, ...)` — so
  // walk past the parameter list before looking for the body.
  let par = 0, scan = text.indexOf('(', from);
  for (; scan < text.length; scan++) {
    if (text[scan] === '(') par++;
    else if (text[scan] === ')') { par--; if (!par) break; }
  }
  let depth = 0, i = text.indexOf('{', scan);
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { const n = text.indexOf('\n', i); i = n < 0 ? text.length : n; continue; }
    if (c === '/' && text[i + 1] === '*') { const n = text.indexOf('*/', i + 2); i = n < 0 ? text.length : n + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < text.length && text[i] !== q) { if (text[i] === '\\') i++; i++; } continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return i; }
  }
  throw new Error('unbalanced startWorld');
}

// Boot the page and hand back the world it built. The module ends with its own `await bootstrap()`, so
// simply compiling and calling it runs the whole startup — which is the point: the bench does not get to
// skip a step the browser would have taken.
export async function buildWorld(options = {}) {
  const started = Date.now();
  // The page decides its compact layout from the real viewport at boot. Permit a mobile-sized build
  // without leaking its globals into other worlds subsequently built by the same process.
  const prev = [windowStub.innerWidth, windowStub.innerHeight, globalThis.innerWidth, globalThis.innerHeight,
    windowStub.matchMedia, globalThis.matchMedia];
  if (options.width !== undefined) windowStub.innerWidth = globalThis.innerWidth = options.width;
  if (options.height !== undefined) windowStub.innerHeight = globalThis.innerHeight = options.height;
  if (options.reducedMotion !== undefined) {
    const original = windowStub.matchMedia;
    windowStub.matchMedia = globalThis.matchMedia = q => ({ ...original(q),
      matches: q === '(prefers-reduced-motion: reduce)' ? options.reducedMotion : original(q).matches });
  }
  let world;
  try { world = await loadPage(options.file); }
  finally {
    [windowStub.innerWidth, windowStub.innerHeight, globalThis.innerWidth, globalThis.innerHeight,
      windowStub.matchMedia, globalThis.matchMedia] = prev;
  }
  if (!world) throw new Error('the page never finished building a world: ' + JSON.stringify(globalThis.__startup?.error || null));
  world.buildMs = Date.now() - started;
  return world;
}
