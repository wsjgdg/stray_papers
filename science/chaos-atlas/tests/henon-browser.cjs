'use strict';
// Optional end-to-end tests: install playwright-core and supply Chromium.
// The application itself has no Node or network dependency.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
let server, base;

test.before(async () => {
  server = http.createServer((request, response) => {
    let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (name === '/') name = '/henon-heiles.html';
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/';
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

async function newPage(t, options = {}) {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean));
  let browser;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args }); break; }
    catch (error) { if (attempt === 2 || !/signal=SIGSEGV/.test(String(error))) throw error; }
  }
  t.after(() => browser.close());
  return browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
}
async function disableWebGL(page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /^webgl/.test(kind) ? null : original.call(this, kind, ...args); };
  });
}
async function watchExperiments(page) {
  await page.addInitScript(() => {
    let api; window.__henonExperiments = [];
    Object.defineProperty(window, 'HenonHeiles', { configurable: true, get() { return api; }, set(value) {
      const Original = value.Experiment, step = Original.prototype.step;
      Original.prototype.step = function () {
        const result = step.call(this);
        if (this.lastCrossing) this.__crossings.push({ ...this.lastCrossing });
        return result;
      };
      function Tracked(...args) { const sim = new Original(...args); sim.__crossings = []; window.__henonExperiments.push(sim); return sim; }
      Tracked.prototype = Original.prototype; value.Experiment = Tracked; api = value;
    }});
  });
}
async function watchThree(page) {
  await page.route('**/henon.js*', async route => {
    const response = await route.fetch(), original = await response.text();
    const spy = `if (window.THREE) {
      const Original = THREE.WebGLRenderer;
      THREE.WebGLRenderer = function (...args) {
        const renderer = new Original(...args), old = renderer.render.bind(renderer);
        renderer.render = function (scene, camera) {
          if (scene.getObjectByName('potential-surface')) window.__henonThree = { scene, camera, renderer };
          return old(scene, camera);
        };
        return renderer;
      };
    }\n`;
    await route.fulfill({ response, body: spy + original });
  });
}
async function open(page, url = base + 'henon-heiles.html') {
  await page.goto(url, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready); await twoFrames(page);
}
async function twoFrames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function sampleFinished(page, count = 100) {
  await page.waitForFunction(n => document.querySelectorAll('#section-sampled circle').length === n && document.querySelector('#sample-section').textContent === '重新采样', count, { timeout: 30000 });
}
async function setRange(page, id, value) {
  await page.locator(id).evaluate((input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function hasWebGL(page, t) {
  const available = await page.evaluate(() => !!(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')));
  if (!available) { t.skip('WebGL unavailable; run with hardware or software WebGL'); return false; }
  assert.equal(await page.locator('#henon-stage').getAttribute('data-renderer'), 'webgl'); return true;
}
async function imageHash(page) {
  await twoFrames(page);
  const data = await page.locator('#henon-scene').evaluate(canvas => canvas.toDataURL('image/png'));
  return createHash('sha256').update(data).digest('hex');
}
// Project a state point with the same documented scene scale and default camera.
// This is independent of the application's private interaction state.
async function pointOnScreen(page, x, y) {
  return page.evaluate(({ x, y }) => {
    const stage = document.querySelector('#henon-stage').getBoundingClientRect(), hud = document.querySelector('.lab-bottom').getBoundingClientRect();
    const controls = document.querySelector('#control-panel'), knowledge = document.querySelector('#knowledge-panel'), w = stage.width, h = stage.height;
    let left = 48, right = w - 48, top = 102, bottom = h - 160;
    if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right + 12);
    if (!knowledge.hidden) right = Math.min(right, knowledge.getBoundingClientRect().left - 12);
    if (hud.width && hud.top > top + 100) bottom = Math.min(bottom, hud.top - 22);
    if (right - left < 110) { left = 44; right = w - 44; }
    if (bottom - top < 100) { top = 55; bottom = Math.max(top + 100, h - 95); }
    const cx = (left + right) / 2, cy = (top + bottom) / 2 + (w > 700 ? Math.min(25, (bottom - top) * .04) : 0);
    const pixels = Math.max(1, Math.min((right - left) * .93 / 7.8, (bottom - top) * .9 / 7.8));
    const fov = Math.max(22, Math.min(108, 2 * Math.atan(h / (2 * pixels * 8.5)) * 180 / Math.PI));
    const sy = Math.sin(.68), cyaw = Math.cos(.68), sp = Math.sin(.9), cp = Math.cos(.9);
    const rightAxis = [cyaw, 0, -sy], up = [-sy * sp, cp, -cyaw * sp], facing = [sy * cp, sp, cyaw * cp];
    const p = [x * 2, window.HenonHeiles.potential(x, y) * 8 + .075 - 1, y * 2];
    const dot = axis => axis.reduce((sum, v, i) => sum + v * p[i], 0), depth = dot(facing);
    const scale = h / (2 * Math.tan(fov * Math.PI / 360)) / (8.5 - depth);
    return { x: stage.left + cx + dot(rightAxis) * scale, y: stage.top + cy - dot(up) * scale };
  }, { x, y });
}
async function dragPoint(page, from, to) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up(); await twoFrames(page);
}
async function sectionPoint(page, x, px) {
  return page.evaluate(({ x, px }) => {
    const svg = document.querySelector('#section-chart'), point = svg.createSVGPoint();
    const radius = Math.sqrt(2 * Number(document.querySelector('#energy').value));
    point.x = 120 + 78 * x / radius; point.y = 102 - 78 * px / radius;
    const p = point.matrixTransform(svg.getScreenCTM()); return { x: p.x, y: p.y };
  }, { x, px });
}
async function projectWorld(page, point) {
  return page.evaluate(point => {
    const stage = document.querySelector('#henon-stage').getBoundingClientRect(), hud = document.querySelector('.lab-bottom').getBoundingClientRect();
    const controls = document.querySelector('#control-panel'), knowledge = document.querySelector('#knowledge-panel'), w = stage.width, h = stage.height;
    let left = 48, right = w - 48, top = 102, bottom = h - 160;
    if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right - stage.left + 12);
    if (!knowledge.hidden) right = Math.min(right, knowledge.getBoundingClientRect().left - stage.left - 12);
    if (hud.width && hud.top - stage.top > top + 100) bottom = Math.min(bottom, hud.top - stage.top - 22);
    if (right - left < 110) { left = 44; right = w - 44; }
    if (bottom - top < 100) { top = 55; bottom = Math.max(top + 100, h - 95); }
    const centerX = (left + right) / 2, centerY = (top + bottom) / 2 + (w > 700 ? Math.min(25, (bottom - top) * .04) : 0);
    const pixels = Math.max(1, Math.min((right - left) * .93 / 7.8, (bottom - top) * .9 / 7.8));
    const fov = Math.max(22, Math.min(108, 2 * Math.atan(h / (2 * pixels * 8.5)) * 180 / Math.PI));
    const sy = Math.sin(.68), cy = Math.cos(.68), sp = Math.sin(.9), cp = Math.cos(.9);
    const rightAxis = [cy, 0, -sy], up = [-sy * sp, cp, -cy * sp], facing = [sy * cp, sp, cy * cp];
    const p = [point[0], point[1] - 1, point[2]], dot = axis => axis.reduce((sum, v, i) => sum + v * p[i], 0);
    const scale = h / (2 * Math.tan(fov * Math.PI / 360)) / (8.5 - dot(facing));
    return [centerX + dot(rightAxis) * scale, centerY - dot(up) * scale];
  }, point);
}
async function surfacePoint(page, x, y, lift = 0) {
  const v = await page.evaluate(({ x, y }) => window.HenonHeiles.potential(x, y), { x, y });
  const projected = await projectWorld(page, [2 * x, 8 * v + lift, 2 * y]);
  const stage = await page.locator('#henon-stage').boundingBox();
  return { x: stage.x + projected[0], y: stage.y + projected[1] };
}
async function watchCanvasVelocity(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, stroke = proto.stroke;
    proto.beginPath = function (...args) { this.__velocityPath = []; return begin.apply(this, args); };
    proto.moveTo = function (x, y) { if (this.__velocityPath) this.__velocityPath.push(['M', x, y]); return move.call(this, x, y); };
    proto.lineTo = function (x, y) { if (this.__velocityPath) this.__velocityPath.push(['L', x, y]); return line.call(this, x, y); };
    proto.stroke = function (...args) {
      if (this.canvas.id === 'henon-scene') {
        const color = this.strokeStyle.toLowerCase();
        if (color === '#c6b5e7') window.__velocityPath = this.__velocityPath.slice();
        if (color === '#ef9b86' || color === '#80baf0') {
          window.__fieldPaths ||= {}; window.__fieldPaths[color] = this.__velocityPath.slice();
        }
      }
      return stroke.apply(this, args);
    };
  });
}
async function visibleModel(page) {
  await twoFrames(page);
  const alpha = await page.locator('#henon-scene').evaluate(canvas => {
    const c = canvas.getContext('2d');
    if (c) {
      const bytes = c.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonzero = 0; for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) nonzero++;
      return nonzero;
    }
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let nonzero = 0; for (let i = 3; i < bytes.length; i += 4) if (bytes[i]) nonzero++;
    return nonzero;
  });
  assert.ok(alpha > 1000, `rendered graph should contain visible pixels, got ${alpha}`);
}

// Verify not merely a decorative surface: every sampled height and overlay is
// derived from the actual mathematical potential and current integration.
test('WebGL draws V(x,y), its energy contour, true saddles and the integrated trajectory', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchExperiments(page); await watchThree(page); await open(page);
  if (!await hasWebGL(page, t)) return;
  await visibleModel(page);
  await page.evaluate(() => { for (let i = 0; i < 40; i++) document.querySelector('#step').click(); }); await twoFrames(page);
  const actual = await page.evaluate(() => {
    const { scene } = window.__henonThree, H = window.HenonHeiles, sim = window.__henonExperiments[0];
    const surface = scene.getObjectByName('potential-surface'), values = surface.geometry.attributes.position.array;
    let maxError = 0, maxRadius = 0, maxHeight = -Infinity;
    for (let i = 0; i < values.length; i += 3) {
      const x = values[i] / 2, y = values[i + 2] / 2, v = values[i + 1] / 8;
      maxError = Math.max(maxError, Math.abs(v - H.potential(x, y))); maxRadius = Math.max(maxRadius, Math.hypot(x, y)); maxHeight = Math.max(maxHeight, v);
    }
    const contour = scene.getObjectByName('energy-contour').geometry.attributes.position.array;
    let contourError = 0, heightError = 0;
    for (let i = 0; i < contour.length; i += 3) {
      contourError = Math.max(contourError, Math.abs(H.potential(contour[i] / 2, contour[i + 2] / 2) - .125));
      heightError = Math.max(heightError, Math.abs(contour[i + 1] - (.125 * 8 + .018)));
    }
    const marker = scene.getObjectByName('henon-point').position.toArray();
    const line = scene.getObjectByName('mapped-trail'), lineValues = line.geometry.attributes.position.array, count = line.geometry.drawRange.count;
    const saddles = scene.getObjectByName('escape-saddles').children.filter(item => item.isMesh).map(item => item.position.toArray());
    return { vertices: values.length / 3, maxError, maxRadius, maxHeight, contourCount: contour.length / 3, contourError, heightError, marker,
      state: Array.from(sim.state), time: sim.time(), lineCount: count, end: Array.from(lineValues.slice((count - 1) * 3, count * 3)), saddles };
  });
  assert.ok(actual.vertices > 10000 && actual.maxError < .001 && actual.maxRadius <= 1.500001 && actual.maxHeight <= .360001, JSON.stringify(actual));
  assert.ok(actual.contourCount > 100 && actual.contourError < .001 && actual.heightError < 1e-6);
  assert.ok(actual.lineCount > 30 && actual.time === 160 / 240);
  const [x, y] = actual.state, potential = (x * x + y * y) / 2 + x * x * y - y ** 3 / 3;
  assert.ok(Math.abs(actual.marker[0] - x * 2) < 1e-9 && Math.abs(actual.marker[1] - (potential * 8 + .075)) < 1e-9 && Math.abs(actual.marker[2] - y * 2) < 1e-9);
  assert.ok(Math.abs(actual.end[0] - 2 * x) < 1e-5 && Math.abs(actual.end[1] - (8 * potential + .025)) < 1e-5 && Math.abs(actual.end[2] - 2 * y) < 1e-5);
  assert.equal(actual.saddles.length, 3);
  for (const [sx, sy, sz] of actual.saddles) {
    assert.ok(Math.abs(Math.hypot(sx / 2, sz / 2) - 1) < 1e-12 && Math.abs(sy - (8 / 6 + .04)) < 1e-12);
  }
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D']) {
  test(`${mode}: picking the section creates a genuine upward state and preserves a same-energy comparison`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await sampleFinished(page); await page.locator('#pin-section').click();
    const reference = await page.locator('#section-reference').innerHTML();
    await page.locator('#play').click();
    await page.waitForFunction(() => window.__henonExperiments[0].time() > .1, null, { timeout: 20000 });
    const target = await sectionPoint(page, .22, -.12); await page.mouse.click(target.x, target.y);
    assert.equal(await page.locator('#play-text').innerText(), '播放'); assert.equal(await page.locator('#time-readout').innerText(), '0.00');
    await sampleFinished(page);
    const selected = await page.evaluate(() => {
      const live = window.__henonExperiments.at(-2), sample = window.__henonExperiments.at(-1);
      return { initial: Array.from(live.initial), steps: live.steps, energy: live.energy(), sample: Array.from(sample.initial),
        transform: document.querySelector('#section-initial').getAttribute('transform') };
    });
    const [x, y, px, py] = selected.initial;
    assert.ok(Math.abs(x - .22) < .003 && y === 0 && Math.abs(px + .12) < .003 && py > 0, JSON.stringify(selected));
    assert.ok(Math.abs(selected.energy - .125) < 1e-12 && Math.abs(py * py - (.25 - x * x - px * px)) < 1e-12);
    assert.equal(selected.steps, 0); assert.deepEqual(selected.sample, selected.initial);
    assert.equal(await page.locator('#section-reference').innerHTML(), reference);
    assert.equal(await page.locator('#section-initial').isVisible(), true);
    assert.match(await page.locator('#section-selection').innerText(), /pᵧ₀ = /);
    const expectedX = (120 + 78 * x / .5).toFixed(3), expectedY = (102 - 78 * px / .5).toFixed(3);
    assert.equal(selected.transform, `translate(${expectedX} ${expectedY})`);

    await page.locator('#play').click();
    const before = await page.evaluate(() => ({ count: window.__henonExperiments.length, initial: Array.from(window.__henonExperiments.at(-2).initial), steps: window.__henonExperiments.at(-2).steps }));
    const boundary = await sectionPoint(page, .5, 0); await page.mouse.click(boundary.x, boundary.y);
    assert.match(await page.locator('#section-selection').innerText(), /圆边.*不是向上穿越/);
    const outside = await sectionPoint(page, .55, 0); await page.mouse.click(outside.x, outside.y);
    await page.waitForFunction(steps => window.__henonExperiments.at(-2).steps > steps, before.steps, { timeout: 10000 });
    const after = await page.evaluate(() => ({ count: window.__henonExperiments.length, initial: Array.from(window.__henonExperiments.at(-2).initial) }));
    assert.equal(await page.locator('#play-text').innerText(), '暂停', 'invalid clicks do not pause playback');
    assert.equal(after.count, before.count); assert.deepEqual(after.initial, before.initial);
    assert.equal(await page.locator('#section-reference').innerHTML(), reference);
    assert.equal(await page.locator('#section-sampled circle').count(), 100);
    await page.locator('#play').click(); assert.deepEqual(errors, []);
  });

  test(`${mode}: section drags and rapid keyboard edits cancel stale samples and debounce the latest state`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await sampleFinished(page); await page.locator('#pin-section').click();
    const reference = await page.locator('#section-reference').innerHTML();
    await page.locator('#sample-section').click();
    await page.waitForFunction(() => document.querySelector('#sample-section').textContent === '取消采样' && window.__henonExperiments.at(-1).steps > 0);
    const oldIndex = await page.evaluate(() => window.__henonExperiments.length - 1);
    const start = await sectionPoint(page, .16, -.04), end = await sectionPoint(page, .21, -.11);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
    const cancelledSteps = await page.evaluate(index => window.__henonExperiments[index].steps, oldIndex);
    await twoFrames(page); await page.waitForTimeout(80);
    assert.equal(await page.evaluate(index => window.__henonExperiments[index].steps, oldIndex), cancelledSteps, 'an invalidated sampler cannot publish stale points');
    await page.mouse.up(); await sampleFinished(page);
    assert.equal(await page.locator('#section-reference').innerHTML(), reference);
    const beforeKeys = await page.evaluate(() => Array.from(window.__henonExperiments.at(-2).initial));
    assert.ok(Math.abs(beforeKeys[0] - .21) < .003 && Math.abs(beforeKeys[2] + .11) < .003);
    const rapid = await page.evaluate(() => {
      const chart = document.querySelector('#section-chart'), before = window.__henonExperiments.length;
      for (const [key, shiftKey] of [['ArrowRight', false], ['ArrowRight', false], ['ArrowRight', false], ['ArrowUp', true]]) {
        chart.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
      }
      return { before, after: window.__henonExperiments.length, initial: Array.from(window.__henonExperiments.at(-1).initial), circles: document.querySelectorAll('#section-sampled circle').length };
    });
    assert.equal(rapid.after - rapid.before, 4, 'only live resets occur during the synchronous key burst');
    assert.equal(rapid.circles, 0);
    assert.ok(Math.abs(rapid.initial[0] - beforeKeys[0] - .03) < 1e-10 && Math.abs(rapid.initial[2] - beforeKeys[2] - .05) < 1e-10);
    await sampleFinished(page);
    const final = await page.evaluate(() => ({ count: window.__henonExperiments.length, live: Array.from(window.__henonExperiments.at(-2).initial), sample: Array.from(window.__henonExperiments.at(-1).initial) }));
    assert.equal(final.count, rapid.after + 1, 'one independent sample starts after the debounce');
    assert.deepEqual(final.live, rapid.initial); assert.deepEqual(final.sample, rapid.initial);
    assert.equal(await page.locator('#section-reference').innerHTML(), reference);
    const afterEnergyChange = await page.evaluate(() => {
      document.querySelector('#section-chart').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const energy = document.querySelector('#energy'); energy.value = '.126'; energy.dispatchEvent(new Event('input', { bubbles: true }));
      return window.__henonExperiments.length;
    });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => window.__henonExperiments.length), afterEnergyChange, 'an energy edit cancels a pending debounce');
    assert.equal(await page.locator('#section-reference circle').count(), 0);
    assert.equal(await page.locator('#section-sampled circle').count(), 0); assert.deepEqual(errors, []);
  });

  test(`${mode}: the initial marker is shown only for a positive upward section state`, async t => {
    const page = await newPage(t); if (mode === 'Canvas 2D') await disableWebGL(page); await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    // Chromium can report a nonempty SVG <g> bounding box even with display:none;
    // inspect the actual hidden attribute and computed style rather than isVisible().
    const assertMarker = async shown => {
      const marker = await page.locator('#section-initial').evaluate(el => ({ hidden: el.hasAttribute('hidden'), display: getComputedStyle(el).display }));
      assert.equal(marker.hidden, !shown); assert.equal(marker.display === 'none', !shown);
    };
    await assertMarker(true);
    await setRange(page, '#initial-y', .05); await assertMarker(false);
    assert.match(await page.locator('#section-selection').innerText(), /不在上穿截面/);
    await setRange(page, '#initial-y', 0);
    for (const angle of [-90, 0, 180]) { await setRange(page, '#initial-angle', angle); await assertMarker(false); }
    await setRange(page, '#initial-angle', 90); await assertMarker(true);
    await setRange(page, '#initial-y', .05); await page.locator('#section-chart').focus(); await page.keyboard.press('ArrowRight');
    const state = await page.evaluate(() => Array.from(window.__henonExperiments.at(-1).initial));
    assert.equal(state[1], 0); assert.ok(state[3] > 0); await assertMarker(true);
  });

  test(`${mode}: independent directed sampling, cancellation and same-energy reference comparison`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await sampleFinished(page); await visibleModel(page);
    const sample = await page.evaluate(() => {
      const [live, copy] = window.__henonExperiments;
      const circles = Array.from(document.querySelectorAll('#section-sampled circle')).map(el => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]);
      return { live: { steps: live.steps, initial: live.initial }, sample: { steps: copy.steps, initial: copy.initial, hits: copy.__crossings, error: copy.energyError() }, circles };
    });
    assert.equal(sample.live.steps, 0); assert.deepEqual(sample.sample.initial, sample.live.initial);
    assert.equal(sample.sample.hits.length, 100); assert.ok(sample.sample.steps > 100000 && Math.abs(sample.sample.error) < 1e-8);
    for (let i = 0; i < 100; i++) {
      const hit = sample.sample.hits[i], circle = sample.circles[i];
      assert.ok(hit.py > 0 && Math.abs(circle[0] - (120 + 78 * hit.x / Math.sqrt(.25))) < .011 && Math.abs(circle[1] - (102 - 78 * hit.px / Math.sqrt(.25))) < .011);
    }
    assert.match(await page.locator('#section-status').innerText(), /采样完成.*100 次上穿/);
    await page.locator('#pin-section').click();
    const reference = await page.locator('#section-reference').innerHTML(); assert.equal(await page.locator('#section-reference circle').count(), 100);
    await page.locator('[data-preset="complex"]').click(); await sampleFinished(page);
    assert.equal(await page.locator('#section-reference').innerHTML(), reference);
    const comparison = await page.evaluate(() => ({ reference: Array.from(document.querySelectorAll('#section-reference circle')).map(c => Number(c.getAttribute('cx'))), sample: Array.from(document.querySelectorAll('#section-sampled circle')).map(c => Number(c.getAttribute('cx'))) }));
    const referenceWidth = Math.max(...comparison.reference) - Math.min(...comparison.reference);
    const sampleWidth = Math.max(...comparison.sample) - Math.min(...comparison.sample);
    assert.ok(referenceWidth > 40 && referenceWidth < 60 && sampleWidth > 130, 'same energy, genuinely different numerical sections');
    await setRange(page, '#energy', .126);
    assert.equal(await page.locator('#section-reference circle').count(), 0); assert.equal(await page.locator('#section-sampled circle').count(), 0);
    assert.match(await page.locator('#section-status').innerText(), /初态已改变/); assert.equal(await page.locator('#clear-reference').isDisabled(), true);
    await page.evaluate(() => { document.querySelector('#sample-section').click(); document.querySelector('#sample-section').click(); });
    const cancelled = await page.evaluate(() => ({ len: window.__henonExperiments.length, steps: window.__henonExperiments.at(-1).steps, status: document.querySelector('#section-status').textContent }));
    await twoFrames(page);
    assert.match(cancelled.status, /取消采样/); assert.equal(await page.evaluate(() => window.__henonExperiments.at(-1).steps), cancelled.steps, 'cancelled job cannot keep advancing');
    assert.deepEqual(errors, []);
  });

  test(`${mode}: constrained initial controls, stepping, plots and view controls use the real model`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    assert.equal(await page.locator('#play-text').innerText(), '播放');
    await page.locator('#step').click(); assert.equal(await page.locator('#time-readout').innerText(), '0.02');
    assert.equal(await page.evaluate(() => window.__henonExperiments[0].steps), 4);
    assert.equal(await page.locator('#section-live circle').count(), 1, 'initial upward passage was computed by the live integrator');
    await setRange(page, '#initial-x', .30);
    await setRange(page, '#energy', .03); assert.equal(await page.locator('#energy-value').innerText(), '0.125');
    await setRange(page, '#initial-x', .95); assert.equal(await page.locator('#initial-x-value').innerText(), '0.30');
    assert.match(await page.locator('#interaction-tip').innerText(), /V ≤ E/);
    await setRange(page, '#initial-x', .2); await setRange(page, '#energy', .03); await setRange(page, '#initial-angle', 30);
    assert.equal(await page.locator('#time-readout').innerText(), '0.00'); assert.equal(await page.locator('#energy-value').innerText(), '0.030');
    const initial = await page.evaluate(() => ({ s: window.__henonExperiments.at(-1).initial, energy: window.__henonExperiments.at(-1).energy(), current: document.querySelector('#play-text').textContent }));
    assert.ok(Math.abs(initial.s[0] - .2) < 1e-12 && Math.abs(initial.s[2] - Math.sqrt(.02) * Math.cos(Math.PI / 6)) < 1e-12);
    assert.ok(Math.abs(initial.energy - .03) < 1e-12 && initial.current === '播放');
    const before = await imageHash(page); await page.locator('#henon-scene').focus(); await page.keyboard.press('ArrowRight');
    assert.notEqual(await imageHash(page), before, 'keyboard rotates the view');
    await page.locator('#reset-view').click(); assert.equal(await imageHash(page), before);
    await page.locator('#henon-scene').focus(); await page.keyboard.press('+'); assert.notEqual(await imageHash(page), before);
    await page.locator('#reset-view').click(); assert.equal(await imageHash(page), before);
    await page.locator('label:has(#show-contour)').click(); assert.notEqual(await imageHash(page), before);
    await page.locator('label:has(#show-contour)').click(); assert.equal(await imageHash(page), before);
    await page.evaluate(() => { for (let i = 0; i < 240; i++) document.querySelector('#step').click(); }); await twoFrames(page);
    const withTrail = await imageHash(page); await page.locator('label:has(#show-trail)').click(); assert.notEqual(await imageHash(page), withTrail);
    assert.ok(Math.abs(await page.evaluate(() => window.__henonExperiments.at(-1).energyError())) < 1e-9);
    assert.deepEqual(errors, []);
  });

  test(`${mode}: dragging follows the gold point from the current state and enforces the initial domain`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await sampleFinished(page);
    await page.evaluate(() => { for (let i = 0; i < 30; i++) document.querySelector('#step').click(); }); await twoFrames(page);
    const current = await page.evaluate(() => Array.from(window.__henonExperiments[0].state));
    const target = [current[0] - .06, current[1] + .03];
    const start = await pointOnScreen(page, current[0], current[1]), end = await pointOnScreen(page, target[0], target[1]);
    await dragPoint(page, start, end);
    const after = await page.evaluate(() => ({ sim: window.__henonExperiments.at(-1).initial, t: window.__henonExperiments.at(-1).time(), error: window.HenonHeiles.potential(...window.__henonExperiments.at(-1).initial) - .125 }));
    assert.ok(Math.abs(after.sim[0] - target[0]) < .01 && Math.abs(after.sim[1] - target[1]) < .01, JSON.stringify({ current, target, after }));
    assert.equal(after.t, 0); assert.ok(after.error <= 1e-12); assert.equal(await page.locator('#play-text').innerText(), '播放');
    assert.equal(await page.locator('#section-sampled circle').count(), 0, 'editing the initial point invalidates the sample');
    const start2 = await pointOnScreen(page, after.sim[0], after.sim[1]), outside = await pointOnScreen(page, .95, .95);
    await dragPoint(page, start2, outside);
    const constrained = await page.evaluate(() => { const s = window.__henonExperiments.at(-1).initial; return { r: Math.hypot(s[0], s[1]), v: window.HenonHeiles.potential(s[0], s[1]) }; });
    assert.ok(constrained.r <= .950000001 && constrained.v <= .125000000001, JSON.stringify(constrained));
    assert.equal(await page.locator('#stage-error').isVisible(), false); assert.deepEqual(errors, []);
  });

  test(`${mode}: the open-channel example pauses at an observation boundary rather than claiming proven escape`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await page.locator('[data-preset="open"]').click();
    await page.waitForFunction(() => document.querySelector('#section-status').textContent.includes('越出观察区'), null, { timeout: 30000 });
    assert.equal(await page.locator('#energy-state').innerText(), '几何通道开放');
    // Advance via the actual UI's single-step action; this avoids a long wall-clock test.
    await page.evaluate(() => { for (let i = 0; i < 300 && document.querySelector('#stage-notice').hidden; i++) document.querySelector('#step').click(); });
    assert.equal(await page.locator('#stage-notice').isVisible(), true);
    assert.match(await page.locator('#stage-notice').innerText(), /不是严格逃逸证明/);
    assert.equal(await page.locator('#play').isDisabled(), true); assert.equal(await page.locator('#step').isDisabled(), true);
    const sim = await page.evaluate(() => { const s = window.__henonExperiments.at(-2); return { state: Array.from(s.state), time: s.time(), error: s.energyError() }; });
    assert.ok(sim.time > 3 && sim.time < 5 && Math.hypot(sim.state[0], sim.state[1]) >= 1.5 && Math.abs(sim.error) < 1e-8, JSON.stringify(sim));
    await page.locator('#reset').click(); assert.equal(await page.locator('#stage-notice').isVisible(), false);
    assert.equal(await page.locator('#play').isEnabled(), true); assert.equal(await page.locator('#time-readout').innerText(), '0.00');
    assert.deepEqual(errors, []);
  });

  test(`${mode}: screenshot, playback, cards and navigation work without changing the mathematical state`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    for (const note of ['landscape', 'threshold', 'equations', 'section']) {
      await page.locator(`[data-note="${note}"]`).click();
      assert.equal(await page.locator(`[data-note-content="${note}"]`).isVisible(), true);
    }
    const pending = page.waitForEvent('download'); await page.locator('#save-image').click();
    const download = await pending, file = await download.path();
    assert.equal(download.suggestedFilename(), 'chaos-lab-henon-heiles.png');
    assert.deepEqual(fs.readFileSync(file).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    await page.locator('#play').click(); await page.waitForFunction(() => window.__henonExperiments[0].time() >= .3, null, { timeout: 20000 });
    await page.locator('#play').click(); const time = await page.evaluate(() => window.__henonExperiments[0].time()); assert.ok(time >= .3);
    await page.locator('#reset').click(); assert.equal(await page.locator('#time-readout').innerText(), '0.00'); assert.equal(await page.locator('#play-text').innerText(), '播放');
    await page.locator('#step').click(); const pausedTime = await page.locator('#time-readout').innerText();
    await page.locator('#nav-toggle').click();
    assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(items => items.map(item => item.getAttribute('href'))), require('./navigation-fixtures.cjs')['henon-heiles.html']);
    assert.equal(await page.locator('#lab-navigation [aria-current="page"]').count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#lab-navigation').isVisible(), false);
    assert.equal(await page.locator('#time-readout').innerText(), pausedTime);
    assert.deepEqual(errors, []);
  });
}

for (const mode of ['WebGL', 'Canvas 2D']) test(`${mode}: the velocity arrow matches planar momentum, speed, visibility and zero-speed behavior`, async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
  if (mode === 'Canvas 2D') { await disableWebGL(page); await watchCanvasVelocity(page); } else await watchThree(page);
  await watchExperiments(page); await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  let liveIndex = 0;
  async function verifyVelocity() {
    await twoFrames(page);
    const actual = await page.evaluate(index => {
      const s = Array.from(window.__henonExperiments[index].state), arrow = window.__henonThree && window.__henonThree.scene.getObjectByName('planar-velocity');
      return { s, readout: document.querySelector('#speed-readout').textContent, path: window.__velocityPath,
        arrow: arrow && { visible: arrow.visible, start: arrow.position.toArray(), direction: new THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion).toArray(), length: arrow.cone.position.y } };
    }, liveIndex);
    const [x, y, px, py] = actual.s, speed = Math.hypot(px, py), length = Math.min(1.25, 2 * speed), direction = [px / speed, 0, py / speed];
    assert.ok(Math.abs(Number(actual.readout) - speed) <= .00051, JSON.stringify(actual));
    const start = [2 * x, -.02, 2 * y], end = [start[0] + length * direction[0], start[1], start[2] + length * direction[2]];
    if (mode === 'WebGL') {
      assert.equal(actual.arrow.visible, true);
      assert.ok(actual.arrow.start.every((value, i) => Math.abs(value - start[i]) < 1e-10));
      assert.ok(actual.arrow.direction.every((value, i) => Math.abs(value - direction[i]) < 1e-9), JSON.stringify(actual));
      assert.ok(Math.abs(actual.arrow.length - length) < 1e-10);
    } else {
      assert.ok(actual.path && actual.path.length >= 2, JSON.stringify(actual));
      const screenStart = await projectWorld(page, start), screenEnd = await projectWorld(page, end);
      assert.equal(actual.path[0][0], 'M'); assert.equal(actual.path[1][0], 'L');
      assert.ok(Math.hypot(actual.path[0][1] - screenStart[0], actual.path[0][2] - screenStart[1]) < .1, JSON.stringify({ actual, screenStart, screenEnd }));
      assert.ok(Math.hypot(actual.path[1][1] - screenEnd[0], actual.path[1][2] - screenEnd[1]) < .1, JSON.stringify({ actual, screenStart, screenEnd }));
    }
    return { speed, length };
  }
  await verifyVelocity();
  const shown = await imageHash(page);
  await page.locator('label:has(#show-velocity)').click(); assert.notEqual(await imageHash(page), shown);
  if (mode === 'WebGL') assert.equal(await page.evaluate(() => window.__henonThree.scene.getObjectByName('planar-velocity').visible), false);
  await page.locator('label:has(#show-velocity)').click(); assert.equal(await imageHash(page), shown);
  await page.locator('label:has(#show-projection)').click();
  assert.equal(await page.locator('#henon-stage').evaluate(el => el.getBoundingClientRect().top), 0, 'focusing a lower control does not scroll the fullscreen stage');
  await page.evaluate(() => { for (let i = 0; i < 120; i++) document.querySelector('#step').click(); });
  await verifyVelocity();
  await setRange(page, '#energy', .24); liveIndex = await page.evaluate(() => window.__henonExperiments.length - 1);
  const capped = await verifyVelocity(); assert.ok(capped.speed > .625 && capped.length === 1.25, JSON.stringify(capped));
  await setRange(page, '#energy', .125);
  await page.evaluate(() => {
    const input = document.querySelector('#initial-x'); input.value = '.5'; input.dispatchEvent(new Event('input', { bubbles: true }));
    window.__velocityPath = null;
  });
  await twoFrames(page);
  assert.equal(await page.locator('#speed-readout').textContent(), '0.000');
  if (mode === 'WebGL') assert.equal(await page.evaluate(() => window.__henonThree.scene.getObjectByName('planar-velocity').visible), false);
  else assert.equal(await page.evaluate(() => window.__velocityPath), null);
  const zero = await imageHash(page); await page.locator('label:has(#show-velocity)').click(); assert.equal(await imageHash(page), zero);
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D']) {
  test(`${mode}: terrain hover and click measure the true surface without changing a running orbit`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await sampleFinished(page); await page.locator('#pin-section').click();
    const reference = await page.locator('#section-reference').innerHTML();
    await page.locator('#play').click();
    await page.waitForFunction(() => window.__henonExperiments[0].time() > .1);
    const before = await page.evaluate(() => ({ count: window.__henonExperiments.length, initial: Array.from(window.__henonExperiments[0].initial), steps: window.__henonExperiments[0].steps }));
    const location = await surfacePoint(page, -.3, .25);
    await page.mouse.move(location.x, location.y);
    await page.waitForFunction(() => document.querySelector('#henon-scene').dataset.pointerTarget === 'terrain');
    assert.equal(await page.locator('#terrain-hover').isVisible(), true);
    const hover = await page.locator('#terrain-hover').innerText();
    assert.match(hover, /x -0\.300.*y 0\.250/); assert.match(hover, /V 0\.0935.*\|F\| 0\.529/);
    assert.equal(await page.locator('#henon-scene').evaluate(el => el.style.cursor), 'crosshair');
    assert.match(await page.locator('#probe-coordinates').innerText(), /0\.400.*-0\.250/, 'hover is a preview only');
    await page.mouse.click(location.x, location.y);
    assert.match(await page.locator('#probe-coordinates').innerText(), /-0\.300.*0\.250/);
    assert.equal(await page.locator('#probe-potential').innerText(), '0.0935');
    const force = (await page.locator('#probe-force').textContent()).match(/-?\d+\.\d+/g).map(Number);
    assert.ok(Math.abs(force[0] - .45) < .002 && Math.abs(force[1] + .2775) < .002, JSON.stringify(force));
    await page.waitForFunction(steps => window.__henonExperiments[0].steps > steps, before.steps);
    const after = await page.evaluate(() => ({ count: window.__henonExperiments.length, initial: Array.from(window.__henonExperiments[0].initial) }));
    assert.equal(after.count, before.count); assert.deepEqual(after.initial, before.initial);
    assert.equal(await page.locator('#play-text').innerText(), '暂停');
    assert.equal(await page.locator('#section-reference').innerHTML(), reference);
    await page.locator('#play').click();
    const probe = await surfacePoint(page, -.3, .25, .075); await page.mouse.move(probe.x, probe.y);
    await page.waitForFunction(() => document.querySelector('#henon-scene').dataset.pointerTarget === 'probe');
    assert.equal(await page.locator('#terrain-hover').isVisible(), false);
    assert.equal(await page.locator('#henon-scene').evaluate(el => el.style.cursor), 'grab');
    const particle = await page.evaluate(() => Array.from(window.__henonExperiments[0].state));
    const marker = await surfacePoint(page, particle[0], particle[1], .075); await page.mouse.move(marker.x, marker.y);
    await page.waitForFunction(() => document.querySelector('#henon-scene').dataset.pointerTarget === 'particle');
    await page.mouse.down(); assert.equal(await page.locator('#henon-scene').evaluate(el => el.style.cursor), 'grabbing'); await page.mouse.up();
    await page.mouse.move(10, 30); await page.waitForTimeout(40);
    assert.equal(await page.locator('#terrain-hover').isVisible(), false); assert.deepEqual(errors, []);
  });

  test(`${mode}: dragging and keyboard-adjusting the probe are independent until applying a valid initial state`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await sampleFinished(page); await page.locator('#pin-section').click();
    const reference = await page.locator('#section-reference').innerHTML();
    const before = await page.evaluate(() => ({ count: window.__henonExperiments.length, initial: Array.from(window.__henonExperiments[0].initial), steps: window.__henonExperiments[0].steps }));
    const from = await surfacePoint(page, .4, -.25, .075), to = await surfacePoint(page, .33, -.18, .075);
    await dragPoint(page, from, to);
    const afterDrag = await page.evaluate(() => ({ x: Number(document.querySelector('#probe-x-value').textContent), y: Number(document.querySelector('#probe-y-value').textContent), count: window.__henonExperiments.length, initial: Array.from(window.__henonExperiments[0].initial), steps: window.__henonExperiments[0].steps }));
    assert.ok(Math.abs(afterDrag.x - .33) < .01 && Math.abs(afterDrag.y + .18) < .01, JSON.stringify(afterDrag));
    assert.equal(afterDrag.count, before.count); assert.equal(afterDrag.steps, before.steps); assert.deepEqual(afterDrag.initial, before.initial);
    await page.locator('#probe-x').focus(); await page.keyboard.press('ArrowRight');
    const adjusted = Number(await page.locator('#probe-x-value').textContent());
    assert.ok(adjusted > afterDrag.x && adjusted - afterDrag.x < .025);
    assert.equal(await page.evaluate(() => window.__henonExperiments.length), before.count);
    await setRange(page, '#probe-y', .1); await setRange(page, '#probe-x', .2);
    await page.locator('#probe-apply').click(); await sampleFinished(page);
    const applied = await page.evaluate(() => ({ live: Array.from(window.__henonExperiments.at(-2).initial), sample: Array.from(window.__henonExperiments.at(-1).initial), energy: window.__henonExperiments.at(-2).energy() }));
    assert.ok(Math.abs(applied.live[0] - .2) < 1e-12 && Math.abs(applied.live[1] - .1) < 1e-12 && Math.abs(applied.energy - .125) < 1e-12);
    assert.deepEqual(applied.live, applied.sample); assert.equal(await page.locator('#play-text').innerText(), '播放');
    assert.equal(await page.locator('#section-reference').innerHTML(), reference);
    await setRange(page, '#probe-y', 0); await setRange(page, '#probe-x', .8);
    assert.equal(await page.locator('#probe-apply').isDisabled(), true); assert.match(await page.locator('#probe-availability').innerText(), /设初态需/);
    const count = await page.evaluate(() => window.__henonExperiments.length);
    await setRange(page, '#probe-y', 1.5);
    assert.equal(await page.locator('#probe-y-value').textContent(), '0.000', 'out-of-domain slider input is rejected');
    assert.equal(await page.evaluate(() => window.__henonExperiments.length), count); assert.deepEqual(errors, []);
  });

  test(`${mode}: orbit drags, double-click reset and pointer cancellation do not relocate the probe`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchExperiments(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await sampleFinished(page);
    const baseline = await page.evaluate(() => ({ probe: document.querySelector('#probe-coordinates').textContent, initial: Array.from(window.__henonExperiments[0].initial), steps: window.__henonExperiments[0].steps }));
    const baselineImage = await imageHash(page), location = await surfacePoint(page, -.3, .25);
    await page.mouse.move(location.x, location.y);
    await page.waitForFunction(() => document.querySelector('#henon-scene').dataset.pointerTarget === 'terrain');
    await dragPoint(page, location, { x: location.x + 70, y: location.y + 18 });
    assert.equal(await page.locator('#probe-coordinates').textContent(), baseline.probe, 'dragging terrain orbits rather than placing Q');
    assert.notEqual(await imageHash(page), baselineImage, 'the camera moved');
    // Choose an unoccupied bit of visible terrain in the rotated view.
    let terrain;
    for (const dx of [-80, -50, 40, 90, -120]) {
      const point = { x: 720 + dx, y: 430 };
      await page.mouse.move(point.x, point.y); await twoFrames(page);
      if (await page.locator('#henon-scene').getAttribute('data-pointer-target') === 'terrain') { terrain = point; break; }
    }
    assert.ok(terrain, 'a visible terrain point is available after orbiting');
    await page.mouse.dblclick(terrain.x, terrain.y, { delay: 60 });
    await page.mouse.move(5, 30); await twoFrames(page);
    assert.equal(await page.locator('#probe-coordinates').textContent(), baseline.probe, 'double-click resets the view, not Q');
    assert.equal(await imageHash(page), baselineImage, 'double-click restores the original view');
    await page.mouse.move(location.x, location.y); await page.mouse.down();
    await page.locator('#henon-scene').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', clientX: location.x, clientY: location.y });
    await page.mouse.up(); await twoFrames(page);
    assert.equal(await page.locator('#probe-coordinates').textContent(), baseline.probe, 'a cancelled pointer cannot place Q');
    assert.notEqual(await page.locator('#henon-scene').evaluate(el => el.style.cursor), 'grabbing');
    await page.mouse.click(location.x, location.y);
    assert.match(await page.locator('#probe-coordinates').textContent(), /-0\.300.*0\.250/, 'interaction recovers after cancellation');
    await page.locator('label:has(#show-probe)').click();
    await page.mouse.dblclick(location.x, location.y, { delay: 60 });
    assert.equal(await page.locator('#show-probe').isChecked(), false, 'double-click does not reveal a hidden probe');
    assert.match(await page.locator('#probe-coordinates').textContent(), /-0\.300.*0\.250/);
    const after = await page.evaluate(() => ({ initial: Array.from(window.__henonExperiments[0].initial), steps: window.__henonExperiments[0].steps }));
    assert.deepEqual(after.initial, baseline.initial); assert.equal(after.steps, baseline.steps); assert.deepEqual(errors, []);
  });
}

for (const mode of ['WebGL', 'Canvas 2D']) test(`${mode}: force and gradient arrows follow the chosen physical point with opposite directions`, async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
  if (mode === 'Canvas 2D') { await disableWebGL(page); await watchCanvasVelocity(page); } else await watchThree(page);
  await watchExperiments(page); await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  await sampleFinished(page);
  const baseline = await page.evaluate(() => ({ count: window.__henonExperiments.length, state: Array.from(window.__henonExperiments[0].state), steps: window.__henonExperiments[0].steps }));
  assert.equal(await page.locator('#show-force').isChecked(), true); assert.equal(await page.locator('#show-gradient').isChecked(), false);
  await page.locator('label:has(#show-gradient)').click();
  async function verifyField(x, y) {
    await twoFrames(page);
    const actual = await page.evaluate(() => {
      const scene = window.__henonThree && window.__henonThree.scene;
      function arrow(name) {
        if (!scene) return null; const a = scene.getObjectByName(name);
        return { visible: a.visible, start: a.position.toArray(), direction: new THREE.Vector3(0, 1, 0).applyQuaternion(a.quaternion).toArray(), length: a.cone.position.y };
      }
      return { force: arrow('planar-force'), gradient: arrow('planar-gradient'), paths: window.__fieldPaths };
    });
    const [gx, gy] = await page.evaluate(({ x, y }) => window.HenonHeiles.gradient(x, y), { x, y });
    const magnitude = Math.hypot(gx, gy), length = Math.min(1.25, 2.5 * magnitude), start = [2 * x, -.02, 2 * y];
    for (const [name, sign, color] of [['force', -1, '#ef9b86'], ['gradient', 1, '#80baf0']]) {
      const direction = [sign * gx / magnitude, 0, sign * gy / magnitude];
      if (mode === 'WebGL') {
        const arrow = actual[name]; assert.equal(arrow.visible, true);
        assert.ok(arrow.start.every((v, i) => Math.abs(v - start[i]) < 1e-10), JSON.stringify(actual));
        assert.ok(arrow.direction.every((v, i) => Math.abs(v - direction[i]) < 1e-9), JSON.stringify(actual));
        assert.ok(Math.abs(arrow.length - length) < 1e-10);
      } else {
        const path = actual.paths && actual.paths[color]; assert.ok(path && path.length >= 2, JSON.stringify(actual));
        const end = [start[0] + length * direction[0], start[1], start[2] + length * direction[2]];
        const a = await projectWorld(page, start), b = await projectWorld(page, end);
        assert.ok(Math.hypot(path[0][1] - a[0], path[0][2] - a[1]) < .1, JSON.stringify({ path, a, b }));
        assert.ok(Math.hypot(path[1][1] - b[0], path[1][2] - b[1]) < .1, JSON.stringify({ path, a, b }));
      }
    }
    return { magnitude, length };
  }
  await verifyField(.15, 0);
  await page.locator('[data-vector-source="probe"]').click(); await verifyField(.4, -.25);
  if (mode === 'WebGL') {
    const probe = await page.evaluate(() => {
      const scene = window.__henonThree.scene, marker = scene.getObjectByName('terrain-probe'), stem = scene.getObjectByName('probe-projection');
      return { visible: marker.visible, position: marker.position.toArray(), stem: Array.from(stem.geometry.attributes.position.array) };
    });
    const v = await page.evaluate(() => window.HenonHeiles.potential(.4, -.25));
    assert.equal(probe.visible, true); assert.ok(Math.abs(probe.position[0] - .8) < 1e-12 && Math.abs(probe.position[1] - (8 * v + .075)) < 1e-12 && Math.abs(probe.position[2] + .5) < 1e-12);
    assert.ok(Math.abs(probe.stem[0] - .8) < 1e-6 && Math.abs(probe.stem[1] + .02) < 1e-6 && Math.abs(probe.stem[2] + .5) < 1e-6);
  }
  const shown = await imageHash(page); await page.locator('label:has(#show-force)').click(); assert.notEqual(await imageHash(page), shown);
  await page.locator('label:has(#show-force)').click(); assert.equal(await imageHash(page), shown);
  await page.locator('label:has(#show-probe)').click();
  assert.equal(await page.locator('#probe-widget').isVisible(), false); assert.equal(await page.locator('[data-vector-source="particle"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-vector-source="probe"]').click(); assert.equal(await page.locator('#show-probe').isChecked(), true);
  await page.evaluate(() => {
    for (const id of ['probe-x', 'probe-y']) { const el = document.getElementById(id); el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); }
    window.__fieldPaths = {};
  });
  await twoFrames(page);
  assert.equal(await page.locator('#probe-force').textContent(), '(0.000, 0.000)');
  if (mode === 'WebGL') assert.deepEqual(await page.evaluate(() => ['planar-force', 'planar-gradient'].map(name => window.__henonThree.scene.getObjectByName(name).visible)), [false, false]);
  else assert.deepEqual(await page.evaluate(() => window.__fieldPaths), {});
  await setRange(page, '#probe-x', .8);
  const capped = await verifyField(.8, 0); assert.ok(capped.magnitude > .5 && capped.length === 1.25);
  assert.equal(await page.locator('#probe-apply').isDisabled(), true);
  await page.locator('#probe-follow').click();
  assert.equal(await page.locator('#probe-x-value').textContent(), '0.150'); assert.equal(await page.locator('#probe-y-value').textContent(), '0.000');
  const after = await page.evaluate(() => ({ count: window.__henonExperiments.length, state: Array.from(window.__henonExperiments[0].state), steps: window.__henonExperiments[0].steps }));
  assert.deepEqual(after, baseline); assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D']) test(`${mode}: actual playback reaches and stops at the open-channel observation limit`, async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
  if (mode === 'Canvas 2D') await disableWebGL(page);
  await watchExperiments(page); await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  await page.locator('[data-preset="open"]').click(); await page.locator('[data-speed="2"]').click();
  const live = await page.evaluate(() => window.__henonExperiments.length - 2);
  await page.locator('#play').click();
  await page.waitForFunction(() => !document.querySelector('#stage-notice').hidden, null, { timeout: 30000 });
  const after = await page.evaluate(index => { const sim = window.__henonExperiments[index]; return { t: sim.time(), s: Array.from(sim.state) }; }, live);
  assert.ok(after.t > 3 && after.t < 5 && Math.hypot(after.s[0], after.s[1]) >= 1.5);
  assert.equal(await page.locator('#play').isDisabled(), true); assert.equal(await page.locator('#play-text').innerText(), '播放');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(index => window.__henonExperiments[index].time(), live), after.t);
  assert.deepEqual(errors, []);
});

test('WebGL context loss during playback continues the same integration in the Canvas projection', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference' }), errors = []; page.on('pageerror', error => errors.push(error.message));
  await watchExperiments(page); await open(page);
  if (!await hasWebGL(page, t)) return;
  await page.waitForFunction(() => window.__henonExperiments[0].time() > .2, null, { timeout: 30000 });
  const before = await page.evaluate(() => window.__henonExperiments[0].steps);
  const triggered = await page.locator('#henon-scene').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false; extension.loseContext(); return true;
  });
  assert.equal(triggered, true); await page.waitForFunction(() => document.querySelector('#henon-stage').dataset.renderer === 'canvas2d');
  await page.waitForFunction(steps => window.__henonExperiments[0].steps > steps + 12, before, { timeout: 30000 });
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  assert.ok(Math.abs(await page.evaluate(() => window.__henonExperiments[0].energyError())) < 1e-8);
  await visibleModel(page); assert.deepEqual(errors, []);
});

test('WebGL context loss preserves the live state, controls and section in Canvas 2D', async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
  await watchExperiments(page); await open(page);
  if (!await hasWebGL(page, t)) return;
  await sampleFinished(page); await page.locator('#pin-section').click();
  await setRange(page, '#probe-y', .1); await setRange(page, '#probe-x', .2);
  await page.locator('[data-vector-source="probe"]').click(); await page.locator('label:has(#show-gradient)').click();
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); });
  const before = await page.evaluate(() => ({ state: Array.from(window.__henonExperiments[0].state), steps: window.__henonExperiments[0].steps, reference: document.querySelector('#section-reference').innerHTML,
    probe: document.querySelector('#probe-coordinates').textContent, force: document.querySelector('#probe-force').textContent, source: document.querySelector('[data-vector-source="probe"]').getAttribute('aria-pressed'), gradient: document.querySelector('#show-gradient').checked }));
  const triggered = await page.locator('#henon-scene').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false; extension.loseContext(); return true;
  });
  assert.equal(triggered, true); await page.waitForFunction(() => document.querySelector('#henon-stage').dataset.renderer === 'canvas2d');
  assert.equal(await page.locator('#stage-fallback').isVisible(), true); await visibleModel(page);
  const after = await page.evaluate(() => ({ state: Array.from(window.__henonExperiments[0].state), steps: window.__henonExperiments[0].steps, reference: document.querySelector('#section-reference').innerHTML,
    probe: document.querySelector('#probe-coordinates').textContent, force: document.querySelector('#probe-force').textContent, source: document.querySelector('[data-vector-source="probe"]').getAttribute('aria-pressed'), gradient: document.querySelector('#show-gradient').checked }));
  assert.deepEqual(after, before);
  await page.locator('#step').click(); assert.equal(await page.evaluate(() => window.__henonExperiments[0].steps), before.steps + 4);
  assert.deepEqual(errors, []);
});

for (const failure of ['initialization', 'exception', 'shader', 'blank']) {
  test(`${failure} WebGL failure switches to a nonempty interactive Canvas projection`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
    if (failure === 'initialization') {
      await page.addInitScript(() => { const old = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (kind, ...args) { if (/^webgl/.test(kind)) throw new Error('synthetic WebGL initialization failure'); return old.call(this, kind, ...args); }; });
    } else {
      await page.route('**/henon.js*', async route => {
        const response = await route.fetch(), source = await response.text();
        const spy = `if (window.THREE) {
          const Original = THREE.WebGLRenderer;
          THREE.WebGLRenderer = function (...args) {
            const renderer = new Original(...args), old = renderer.render.bind(renderer);
            renderer.render = function (scene, camera) {
              if (${JSON.stringify(failure)} === 'exception') throw new Error('synthetic render error');
              const result = old(scene, camera);
              if (${JSON.stringify(failure)} === 'shader' && renderer.info.programs.length) renderer.info.programs[0].diagnostics = { runnable: false };
              if (${JSON.stringify(failure)} === 'blank') { const gl = renderer.getContext(); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
              return result;
            };
            return renderer;
          };
        }\n`;
        await route.fulfill({ response, body: spy + source });
      });
    }
    await open(page);
    if (failure !== 'initialization') {
      const available = await page.evaluate(() => !!(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')));
      if (!available) { t.skip('WebGL unavailable, so the synthetic renderer failure cannot be exercised'); return; }
    }
    assert.equal(await page.locator('#henon-stage').getAttribute('data-renderer'), 'canvas2d');
    assert.equal(await page.locator('#stage-fallback').isVisible(), true); assert.equal(await page.locator('#stage-error').isVisible(), false);
    await visibleModel(page); const before = await imageHash(page);
    await page.locator('#henon-scene').focus(); await page.keyboard.press('ArrowRight'); assert.notEqual(await imageHash(page), before);
    await page.locator('#step').click(); assert.equal(await page.locator('#time-readout').innerText(), '0.02');
    assert.deepEqual(errors, []);
  });
}

test('missing Three.js, offline file access, sampling and manual stepping still work locally', async t => {
  const page = await newPage(t), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.abort()); await open(page);
  assert.equal(await page.locator('#henon-stage').getAttribute('data-renderer'), 'canvas2d'); await sampleFinished(page); await visibleModel(page);
  await page.unroute('**/vendor/three.min.js*');
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.context().setOffline(true); await open(page, pathToFileURL(path.join(root, 'henon-heiles.html')).href);
  await sampleFinished(page); await page.locator('#step').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.02'); assert.deepEqual(external, []); assert.deepEqual(errors, []);
});

test('mobile drawers, touch, keyboard focus and the guided channel demonstration work', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', error => errors.push(error.message)); await disableWebGL(page); await watchExperiments(page); await open(page);
  assert.equal(await page.locator('#control-panel').isVisible(), false); assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  await page.locator('#toggle-knowledge').tap(); await sampleFinished(page);
  await page.locator('#pin-section').tap(); assert.equal(await page.locator('#section-reference circle').count(), 100);
  await page.locator('[data-note="threshold"]').tap();
  await page.locator('[data-try-preset="open"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false); assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-knowledge');
  assert.equal(await page.locator('#play-text').innerText(), '播放'); assert.equal(await page.locator('#energy-value').innerText(), '0.200');
  assert.equal(await page.locator('#section-reference circle').count(), 0, 'different energy clears the pinned comparison');
  await page.keyboard.press('Enter'); assert.equal(await page.locator('#knowledge-panel').isVisible(), true);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  await page.locator('#toggle-controls').tap(); assert.equal(await page.locator('#control-panel').isVisible(), true);
  await page.locator('[data-preset="regular"]').tap(); assert.equal(await page.locator('#energy-value').innerText(), '0.125');
  await page.locator('#toggle-knowledge').tap(); assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('mobile touch selects and drags a section initial state without scrolling the drawer', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', error => errors.push(error.message)); await disableWebGL(page); await watchExperiments(page); await open(page);
  await page.locator('#toggle-knowledge').tap(); await sampleFinished(page); await page.locator('#pin-section').tap();
  const reference = await page.locator('#section-reference').innerHTML();
  await page.locator('#section-chart').scrollIntoViewIfNeeded(); await twoFrames(page);
  const scroll = await page.locator('#knowledge-panel').evaluate(el => el.scrollTop);
  const start = await sectionPoint(page, .12, -.08), end = await sectionPoint(page, .2, .15), session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
  for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 8, y: start.y + (end.y - start.y) * i / 8 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sampleFinished(page);
  const initial = await page.evaluate(() => Array.from(window.__henonExperiments.at(-2).initial));
  assert.ok(Math.abs(initial[0] - .2) < .012 && initial[1] === 0 && Math.abs(initial[2] - .15) < .012 && initial[3] > 0, JSON.stringify(initial));
  assert.equal(await page.locator('#knowledge-panel').evaluate(el => el.scrollTop), scroll);
  assert.equal(await page.locator('#section-reference').innerHTML(), reference);
  assert.equal(await page.locator('#time-readout').innerText(), '0.00'); assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.deepEqual(errors, []);
});

for (const fallback of [false, true]) test(`mobile ${fallback ? 'Canvas' : 'WebGL'}: touch drags the probe and taps the surface without changing the orbit`, async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (fallback) await disableWebGL(page); else await watchThree(page);
  await watchExperiments(page); await open(page);
  if (!fallback && !await hasWebGL(page, t)) return;
  await sampleFinished(page);
  const before = await page.evaluate(() => ({ count: window.__henonExperiments.length, state: Array.from(window.__henonExperiments[0].state), steps: window.__henonExperiments[0].steps }));
  const start = await surfacePoint(page, .4, -.25, .075), end = await surfacePoint(page, .33, -.18, .075), session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] }); await twoFrames(page);
  if (!fallback) assert.equal(await page.evaluate(() => window.__henonThree.scene.getObjectByName('terrain-probe').scale.x), 1.4, 'touching the probe highlights it');
  for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 8, y: start.y + (end.y - start.y) * i / 8 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await twoFrames(page);
  const moved = await page.evaluate(() => ({ x: Number(document.querySelector('#probe-x-value').textContent), y: Number(document.querySelector('#probe-y-value').textContent) }));
  assert.ok(Math.abs(moved.x - .33) < .015 && Math.abs(moved.y + .18) < .015, JSON.stringify(moved));
  if (!fallback) assert.equal(await page.evaluate(() => window.__henonThree.scene.getObjectByName('terrain-probe').scale.x), 1);
  const location = await surfacePoint(page, -.3, .25); await page.touchscreen.tap(location.x, location.y);
  const placed = await page.evaluate(() => ({ x: Number(document.querySelector('#probe-x-value').textContent), y: Number(document.querySelector('#probe-y-value').textContent) }));
  assert.ok(Math.abs(placed.x + .3) < .015 && Math.abs(placed.y - .25) < .015, JSON.stringify(placed));
  const after = await page.evaluate(() => ({ count: window.__henonExperiments.length, state: Array.from(window.__henonExperiments[0].state), steps: window.__henonExperiments[0].steps }));
  assert.deepEqual(after, before); assert.equal(await page.locator('#play-text').innerText(), '播放');
  await page.locator('#toggle-controls').tap(); await page.locator('#probe-x').focus(); await page.keyboard.press('ArrowRight');
  assert.ok(Number(await page.locator('#probe-x-value').textContent()) > placed.x, 'the same probe can be adjusted by keyboard');
  assert.equal(await page.evaluate(() => window.__henonExperiments.length), before.count); assert.deepEqual(errors, []);
});

test('mobile touch directly drags the state point on the potential graph', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', error => errors.push(error.message)); await disableWebGL(page); await watchExperiments(page); await open(page); await sampleFinished(page);
  const start = await pointOnScreen(page, .15, 0), end = await pointOnScreen(page, .22, .05), session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
  for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (end.x - start.x) * i / 8, y: start.y + (end.y - start.y) * i / 8 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await twoFrames(page);
  const initial = await page.evaluate(() => window.__henonExperiments.at(-1).initial);
  assert.ok(Math.abs(initial[0] - .22) < .012 && Math.abs(initial[1] - .05) < .012, JSON.stringify(initial));
  assert.equal(await page.locator('#time-readout').innerText(), '0.00'); assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.deepEqual(errors, []);
});

for (const fallback of [false, true]) test(`${fallback ? 'Canvas' : 'WebGL'}: small and short viewports keep controls and status notices in bounds`, async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
  if (fallback) await disableWebGL(page); await open(page);
  if (!fallback && !await hasWebGL(page, t)) return;
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [568, 320], [768, 1024], [1440, 500], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => {
      const n = document.querySelector('#stage-notice'); n.hidden = false;
      n.textContent = '已向外越出半径 1.5 的观察区，模拟暂停；这不是严格逃逸证明。重置可重试。';
      window.dispatchEvent(new Event('resize'));
    });
    // Chromium may apply viewport metrics and media-query layout a frame apart,
    // especially while the software projection is rendering.
    await page.waitForFunction(({ width, height }) => {
      const stage = document.querySelector('#henon-stage'), s = stage.getBoundingClientRect(), r = document.querySelector('.lab-bottom').getBoundingClientRect();
      const expectedLegendBottom = Math.ceil(Math.max(width <= 360 ? 174 : 150, s.bottom - r.top + 12));
      const framedLegendBottom = parseFloat(stage.style.getPropertyValue('--henon-legend-bottom'));
      return innerWidth === width && innerHeight === height && s.width === width && s.height === height &&
        r.left >= -1 && r.top >= -1 && r.right <= width + 1 && r.bottom <= height + 1 && framedLegendBottom === expectedLegendBottom;
    }, { width, height }, { timeout: 10000 });
    await twoFrames(page);
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect(), hud = rect('.lab-bottom'), legendEl = document.querySelector('.stage-bottom'), legend = legendEl.getBoundingClientRect();
      const overlap = (a, b) => Boolean(a.width && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      const buttons = Array.from(document.querySelectorAll('.transport button')).map(el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
      const widgetEl = document.querySelector('#probe-widget'), widget = widgetEl.getBoundingClientRect();
      const widgetVisible = getComputedStyle(widgetEl).display !== 'none' && !widgetEl.hidden;
      return { overflow: document.documentElement.scrollWidth - innerWidth, legendVisible: getComputedStyle(legendEl).display !== 'none', legendOverlap: overlap(legend, hud), hud: [hud.left, hud.top, hud.right, hud.bottom], buttons,
        widgetVisible, widget: [widget.left, widget.top, widget.right, widget.bottom], widgetOverlaps: widgetVisible ? [['hud', hud], ...['.henon-caption', '.henon-index', '#control-panel', '#knowledge-panel'].map(s => [s, rect(s)])].filter(([, r]) => overlap(widget, r)).map(([name, r]) => [name, r.left, r.top, r.right, r.bottom]) : [] };
    });
    assert.equal(layout.overflow, 0); assert.equal(layout.legendVisible && layout.legendOverlap, false, `${width}×${height}: ${JSON.stringify(layout)}`);
    assert.ok(layout.hud[0] >= 0 && layout.hud[1] >= 0 && layout.hud[2] <= width && layout.hud[3] <= height, JSON.stringify(layout));
    if (layout.widgetVisible) {
      assert.ok(layout.widget[0] >= 0 && layout.widget[1] >= 0 && layout.widget[2] <= width && layout.widget[3] <= height, JSON.stringify(layout));
      assert.deepEqual(layout.widgetOverlaps, [], `${width}×${height}: ${JSON.stringify(layout)}`);
    }
    assert.ok(layout.buttons.every(([l, top, r, bottom]) => l >= layout.hud[0] - 1 && top >= layout.hud[1] - 1 && r <= layout.hud[2] + 1 && bottom <= layout.hud[3] + 1), `${width}×${height}: ${JSON.stringify(layout)}`);
    await visibleModel(page);
  }
  assert.deepEqual(errors, []);
});

test('all companion workbenches link to the fourth scene without breaking their own rendering', async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const [file, stage] of [['index.html', '#model-stage'], ['attractors.html', '#scene'], ['rigid-body.html', '#rigid-stage']]) {
    await page.goto(base + file); await twoFrames(page);
    // The atlas has a different stage id; its canvas still has a stable id.
    const stageExists = await page.locator(stage).count();
    assert.ok(stageExists || (file === 'attractors.html' && await page.locator('canvas').count() > 0), file);
    await page.locator('#nav-toggle').click();
    const link = page.locator('#lab-navigation a[href="henon-heiles.html"]'); assert.equal(await link.isVisible(), true);
    await link.click(); assert.match(page.url(), /henon-heiles\.html$/);
    // Navigation can complete before the new scene finishes initializing.
    await page.waitForFunction(() => document.querySelector('#stage-error').hidden && ['webgl', 'canvas2d'].includes(document.querySelector('#henon-stage').dataset.renderer), null, { timeout: 15000 });
    assert.equal(await page.locator('#stage-error').isVisible(), false);
  }
  assert.deepEqual(errors, []);
});

test('scrollable navigation exposes the other main chapters across workbenches and screen sizes', async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page);
  const menus = require('./navigation-fixtures.cjs'), files = Object.keys(menus);
  for (const file of files) {
    await page.goto(base + file, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [568, 320], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
      await page.locator('#nav-toggle').click();
      const menu = await page.evaluate(() => {
        const nav = document.querySelector('#lab-navigation'), list = document.querySelector('#nav-scroll-list'), bounds = nav.getBoundingClientRect();
        const contained = (outer, inner) => inner.left >= outer.left - .5 && inner.top >= outer.top - .5 && inner.right <= outer.right + .5 && inner.bottom <= outer.bottom + .5;
        list.scrollTop = 0;
        const view = list.getBoundingClientRect(), links = [...list.querySelectorAll('a')].map(link => {
          const rect = link.getBoundingClientRect();
          return { href: link.getAttribute('href'), current: link.getAttribute('aria-current'), initiallyVisible: contained(view, rect),
            contentsFit: [...link.children].every(child => contained(rect, child.getBoundingClientRect())) };
        });
        list.scrollTop = list.scrollHeight;
        // With nine entries on B pages the last desktop row has only one item.
        const end = [...list.querySelectorAll('a')].slice(-1).map(link => contained(view, link.getBoundingClientRect()));
        return { bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom], links, end,
          canScroll: list.scrollHeight > list.clientHeight, slider: !document.querySelector('#nav-position').disabled };
      });
      assert.deepEqual(menu.links.map(link => link.href), menus[file], `${file} at ${width}×${height}`);
      assert.equal(menu.links.filter(link => link.current === 'page').length, 0);
      assert.ok(menu.bounds[0] >= 0 && menu.bounds[1] >= 0 && menu.bounds[2] <= width && menu.bounds[3] <= height, JSON.stringify(menu));
      assert.equal(menu.links.filter(link => link.initiallyVisible).length, 4, `four items initially visible at ${width}×${height}`);
      assert.ok(menu.canScroll && menu.slider && menu.end.every(Boolean) && menu.links.every(link => link.contentsFit), `${file} at ${width}×${height}: ${JSON.stringify(menu)}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#lab-navigation').isVisible(), false);
    }
  }
  assert.deepEqual(errors, []);
});
