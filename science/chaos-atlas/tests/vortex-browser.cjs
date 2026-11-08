'use strict';
// Optional browser regressions: install playwright-core and provide Chromium.
// The application itself needs no Node.js package or network connection.
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
    if (name === '/') name = '/vortex-filament.html';
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
async function watchModel(page) {
  await page.addInitScript(() => {
    let api; window.__vortexExperiments = []; window.__fieldSamples = 0;
    Object.defineProperty(window, 'VortexRings', { configurable: true, get() { return api; }, set(value) {
      const Original = value.Experiment, step = Original.prototype.step, field = value.fieldAt;
      Original.prototype.step = function () { const result = step.call(this); if (this.lastPassage) this.__events.push({ ...this.lastPassage }); return result; };
      function Tracked(...args) { const sim = new Original(...args); sim.__events = []; window.__vortexExperiments.push(sim); return sim; }
      Tracked.prototype = Original.prototype; value.Experiment = Tracked;
      value.fieldAt = function (...args) { window.__fieldSamples++; return field(...args); }; api = value;
    }});
  });
}
async function watchThree(page) {
  await page.route('**/vortex.js*', async route => {
    const response = await route.fetch(), original = await response.text();
    const spy = `if (window.THREE) {
      const Original = THREE.WebGLRenderer;
      THREE.WebGLRenderer = function (...args) {
        const renderer = new Original(...args), render = renderer.render.bind(renderer);
        renderer.render = function (scene, camera) { window.__vortexThree = { scene, camera, renderer }; return render(scene, camera); };
        return renderer;
      };
    }\n`;
    await route.fulfill({ response, body: spy + original });
  });
}
async function watchCanvasArrows(page) {
  await page.addInitScript(() => {
    window.__canvasVortexArrows = {};
    const proto = CanvasRenderingContext2D.prototype, begin = proto.beginPath, move = proto.moveTo, line = proto.lineTo, stroke = proto.stroke;
    proto.beginPath = function (...args) { this.__points = []; return begin.apply(this, args); };
    proto.moveTo = function (x, y) { if (this.__points) this.__points.push([x, y]); return move.call(this, x, y); };
    proto.lineTo = function (x, y) { if (this.__points) this.__points.push([x, y]); return line.call(this, x, y); };
    proto.stroke = function (...args) {
      if (this.canvas.id === 'vortex-scene' && Math.abs(this.lineWidth - 1.6) < 1e-4 && this.__points && this.__points.length >= 2) {
        window.__canvasVortexArrows[this.strokeStyle] = this.__points.slice(0, 2);
      }
      return stroke.apply(this, args);
    };
  });
}
async function open(page, url = base + 'vortex-filament.html') {
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.querySelector('#stage-error').hidden && ['webgl', 'canvas2d'].includes(document.querySelector('#vortex-stage').dataset.renderer));
  await twoFrames(page);
}
async function twoFrames(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function hasWebGL(page, t) {
  const available = await page.evaluate(() => !!(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')));
  if (!available) { t.skip('WebGL unavailable; run with hardware or software WebGL'); return false; }
  assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), 'webgl'); return true;
}
async function setRange(page, selector, value) {
  await page.locator(selector).evaluate((input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function latest(page) {
  return page.evaluate(() => { const e = window.__vortexExperiments.at(-1); return { initial: e.initial, state: Array.from(e.state), gamma: e.gamma, steps: e.steps, time: e.time(), passages: e.passages, events: e.__events, error: e.areaError() }; });
}
async function stepMany(page, n) { await page.evaluate(count => { for (let i = 0; i < count; i++) document.querySelector('#step').click(); }, n); await twoFrames(page); }
async function hash(page) { await twoFrames(page); const data = await page.locator('#vortex-scene').evaluate(canvas => canvas.toDataURL()); return createHash('sha256').update(data).digest('hex'); }
function close(actual, expected, tolerance = 1e-6) { assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected} (± ${tolerance})`); }
function closeArray(actual, expected, tolerance = 1e-6) { assert.equal(actual.length, expected.length); actual.forEach((value, i) => close(value, expected[i], tolerance)); }

// Independent projection of world coordinates for the default camera and framing.
async function projectWorld(page, point) {
  return page.evaluate(point => {
    const stage = document.querySelector('#vortex-stage').getBoundingClientRect(), hud = document.querySelector('.lab-bottom').getBoundingClientRect(), w = stage.width, h = stage.height;
    const controls = document.querySelector('#control-panel'), knowledge = document.querySelector('#knowledge-panel');
    let left = 48, right = w - 48, top = 104, bottom = h - 160;
    if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right - stage.left + 12);
    if (!knowledge.hidden) right = Math.min(right, knowledge.getBoundingClientRect().left - stage.left - 12);
    if (hud.width && hud.top - stage.top > top + 60) bottom = Math.min(bottom, hud.top - stage.top - 22);
    const legend = document.querySelector('.stage-bottom').getBoundingClientRect();
    if (legend.height && legend.top - stage.top > top + 60) bottom = Math.min(bottom, legend.top - stage.top - 12);
    if (right - left < 110) { left = 44; right = w - 44; }
    if (bottom - top < 70) { top = 48; bottom = Math.max(top + 55, Math.min(h - 40, hud.top - stage.top - 12)); }
    const cx = (left + right) / 2, cy = (top + bottom) / 2 + (w > 700 ? Math.min(18, (bottom - top) * .035) : 0);
    const pixels = Math.max(1, Math.min((right - left) * .9 / (w <= 700 ? 3.9 : 5.25), (bottom - top) * .88 / 3.75));
    const fov = Math.max(22, Math.min(140, 2 * Math.atan(h / (2 * pixels * 8.5)) * 180 / Math.PI));
    const sy = Math.sin(.4), cyaw = Math.cos(.4), sp = Math.sin(.22), cp = Math.cos(.22);
    const rightAxis = [cyaw, 0, -sy], up = [-sy * sp, cp, -cyaw * sp], facing = [sy * cp, sp, cyaw * cp];
    const dot = axis => axis.reduce((sum, value, i) => sum + value * point[i], 0), depth = dot(facing);
    const scale = h / (2 * Math.tan(fov * Math.PI / 360)) / (8.5 - depth);
    return [cx + dot(rightAxis) * scale, cy - dot(up) * scale];
  }, point);
}

for (const mode of ['WebGL', 'Canvas 2D']) {
  test(`${mode}: independent initial controls, signed separation, presets and invalid-core rejection`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchModel(page); await open(page); if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), mode === 'WebGL' ? 'webgl' : 'canvas2d');
    assert.equal(await page.locator('#play-text').innerText(), '播放');
    assert.ok(Number(await page.locator('#vortex-stage').getAttribute('data-flow-lines')) > 10);
    assert.ok(await page.evaluate(() => __fieldSamples > 100), 'streamlines sample the real field');
    await setRange(page, '#radius-a', 1.3); await setRange(page, '#radius-b', .7);
    await setRange(page, '#separation', -1.8); await setRange(page, '#gamma-a', 2.5); await setRange(page, '#gamma-b', 1.5);
    await page.locator('[data-orientation="opposed"]').click();
    let sim = await latest(page); closeArray(sim.initial, [1.3, .9, .7, -.9], 1e-12); closeArray(sim.gamma, [2.5, -1.5], 1e-12);
    assert.equal(await page.locator('#separation-value').innerText(), '-1.80');
    await page.locator('#separation').focus(); await page.keyboard.press('ArrowRight');
    sim = await latest(page); close(sim.initial[3] - sim.initial[1], -1.78, 1e-10);
    assert.equal(await page.locator('[data-orientation="opposed"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-ring="B"]').click(); assert.equal(await page.locator('[data-ring="B"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-preset="unequal"]').click(); sim = await latest(page); closeArray(sim.initial, [1, -.5, .85, .5]); closeArray(sim.gamma, [2.5, 1.5]);
    await page.locator('[data-preset="chase"]').click(); const count = await page.evaluate(() => __vortexExperiments.length);
    await setRange(page, '#separation', 0);
    assert.equal(await page.evaluate(() => __vortexExperiments.length), count, 'unsafe edit does not replace the model');
    assert.equal(await page.locator('#separation-value').innerText(), '+1.40');
    assert.match(await page.locator('#interaction-tip').innerText(), /初态.*环核/);
    await page.locator('#play').click(); await setRange(page, '#radius-a', 1.2);
    assert.equal(await page.locator('#play-text').innerText(), '暂停', 'editing an initial condition keeps the playing state');
    await page.locator('#play').click();
    const previous = await page.evaluate(() => __vortexExperiments.length);
    await page.locator('[data-orientation="same"]').click();
    assert.equal(await page.evaluate(() => __vortexExperiments.length), previous, 'reselecting the same sign does not reset');
    assert.deepEqual(errors, []);
  });

  test(`${mode}: computed crossings, bounded trails and explicit near-core and range guards`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
    if (mode === 'Canvas 2D') await disableWebGL(page); else await watchThree(page);
    await watchModel(page); await open(page); if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await stepMany(page, 210); let sim = await latest(page);
    assert.equal(sim.steps, 420); assert.equal(sim.passages, 1); assert.equal(sim.events[0].inner, 'A'); close(sim.events[0].time, 3.4765, .002);
    assert.match(await page.locator('#passage-detail').innerText(), /3\.48.*A/);
    assert.ok((await page.locator('#radius-line-a').getAttribute('d')).includes('L'));
    assert.ok((await page.locator('#radius-line-b').getAttribute('d')).includes('L'));
    assert.ok(Math.abs(sim.error) < 1e-8);
    if (mode === 'WebGL') {
      const trail = await page.evaluate(() => {
        const s = __vortexExperiments.at(-1).state, line = __vortexThree.scene.getObjectByName('vortex-trail-a'), n = line.geometry.drawRange.count, p = line.geometry.attributes.position.array;
        return { n, last: Array.from(p.slice((n - 1) * 3, n * 3)), expected: [s[1] - (s[1] + s[3]) / 2, s[0], 0] };
      });
      assert.ok(trail.n > 2 && trail.n <= 210); closeArray(trail.last, trail.expected, 1e-6);
    }
    await page.locator('[data-preset="unequal"]').click(); await stepMany(page, 720); sim = await latest(page);
    assert.equal(sim.time, 12); assert.ok(sim.passages >= 2); assert.equal(await page.locator('#stage-notice').isVisible(), false, 'unequal-circulation preset should not stop after its first exchange');
    await page.locator('[data-preset="opposed"]').click(); await stepMany(page, 200); sim = await latest(page);
    assert.ok(sim.time > 2.9 && sim.time < 3.1); assert.equal(sim.passages, 0);
    assert.ok(Math.hypot(sim.state[0] - sim.state[2], sim.state[1] - sim.state[3]) <= .30001);
    assert.match(await page.locator('#stage-notice').innerText(), /最短距离.*2\.5ε.*不能.*重联.*重置会重演/);
    assert.equal(await page.locator('#play').isDisabled(), true); assert.equal(await page.locator('#step').isDisabled(), true);
    assert.match(await page.locator('#play').getAttribute('aria-label'), /保护暂停/);
    assert.match(await page.locator('#play').getAttribute('title'), /调整初态/);
    await page.locator('#reset').click(); assert.equal((await latest(page)).steps, 0); assert.equal(await page.locator('#play').isEnabled(), true);
    assert.equal(await page.locator('#play').getAttribute('aria-label'), '播放模拟');
    await stepMany(page, 200); assert.match(await page.locator('#stage-notice').innerText(), /重置会重演/, 'resetting the same opposed initial state reaches the guard again');
    await page.locator('[data-preset="chase"]').click();
    assert.equal(await page.locator('#stage-notice').isVisible(), false); assert.equal(await page.locator('#play').isEnabled(), true);
    await page.locator('[data-preset="opposed"]').click();
    await setRange(page, '#radius-a', 2.3); await setRange(page, '#radius-b', 2.3); await setRange(page, '#separation', 3.2);
    await setRange(page, '#gamma-a', 3.5); await setRange(page, '#gamma-b', 3.5); await stepMany(page, 100); sim = await latest(page);
    assert.ok(sim.state[0] > 2.4 || sim.state[2] > 2.4);
    assert.match(await page.locator('#stage-notice').innerText(), /涡环 [AB] 半径超过上限 2\.40.*保护性暂停.*重置会重演/);
    await page.locator('#reset').click(); assert.equal(await page.locator('#stage-notice').isVisible(), false);
    // The former unequal preset did not hit a near-core limit: B became too small.
    await page.locator('[data-preset="unequal"]').click(); await setRange(page, '#separation', 1.4); await stepMany(page, 640);
    assert.match(await page.locator('#stage-notice').innerText(), /涡环 B 半径低于下限 0\.35.*保护性暂停/);
    await page.locator('[data-preset="chase"]').click(); await setRange(page, '#radius-a', .4); await setRange(page, '#radius-b', .4);
    await setRange(page, '#gamma-a', .5); await setRange(page, '#separation', 3.2); await stepMany(page, 1);
    assert.match(await page.locator('#stage-notice').innerText(), /轴向间距超过上限 3\.20.*保护性暂停/);
    assert.deepEqual(errors, []);
  });

  test(`${mode}: representative velocity arrows, streamlines and independent visibility controls`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
    if (mode === 'Canvas 2D') { await disableWebGL(page); await watchCanvasArrows(page); } else await watchThree(page);
    await watchModel(page); await open(page); if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    // Let the fallback notice's actual height and the stage framing settle
    // before comparing projected pixels to independently computed geometry.
    await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await twoFrames(page);
    const data = await page.evaluate(() => {
      const sim = __vortexExperiments.at(-1), s = Array.from(sim.state), rates = sim.rates(), center = (s[1] + s[3]) / 2;
      const arrow = name => { const a = window.__vortexThree && window.__vortexThree.scene.getObjectByName(name); return a && { visible: a.visible, position: a.position.toArray(), direction: new THREE.Vector3(0, 1, 0).applyQuaternion(a.quaternion).toArray(), length: a.cone.position.y }; };
      const flow = window.__vortexThree && window.__vortexThree.scene.getObjectByName('vortex-streamlines');
      let minimum = 1, checked = 0;
      if (flow) {
        const p = flow.geometry.attributes.position.array, n = flow.geometry.drawRange.count;
        for (let i = 0; i < n * 3; i += 6) {
          const z0 = p[i], r0 = p[i + 1], z1 = p[i + 3], r1 = p[i + 4], dz = z1 - z0, dr = r1 - r0, length = Math.hypot(dz, dr);
          if (length < .085 || length > .095) continue; // Exclude the decorative arrowhead strokes.
          const [ur, uz] = VortexRings.fieldAt(s, sim.gamma, (r0 + r1) / 2, (z0 + z1) / 2 + center), mag = Math.hypot(ur, uz);
          if (mag > 1e-8) { minimum = Math.min(minimum, (ur * dr + uz * dz) / (mag * length)); checked++; }
        }
      }
      return { s, rates, center, a: arrow('vortex-velocity-a'), b: arrow('vortex-velocity-b'), circulation: arrow('vortex-circulation-b-0'), minimum, checked, canvas: window.__canvasVortexArrows };
    });
    for (const [i, name, color] of [[0, 'a', '#ffdab6'], [1, 'b', '#b7f4e8']]) {
      const dr = data.rates[i * 2], dz = data.rates[i * 2 + 1], speed = Math.hypot(dr, dz), length = Math.min(1.15, 1.25 * speed);
      const start = [data.s[i * 2 + 1] - data.center, data.s[i * 2], 0], direction = [dz / speed, dr / speed, 0];
      const end = start.map((value, j) => value + length * direction[j]);
      if (mode === 'WebGL') {
        assert.equal(data[name].visible, true); closeArray(data[name].position, start); closeArray(data[name].direction, direction); close(data[name].length, length);
      } else {
        assert.ok(data.canvas[color], JSON.stringify(data.canvas));
        closeArray(data.canvas[color][0], await projectWorld(page, start), .1); closeArray(data.canvas[color][1], await projectWorld(page, end), .1);
      }
    }
    if (mode === 'WebGL') { assert.ok(data.checked > 100); assert.ok(data.minimum > .995, `streamline/field alignment ${data.minimum}`); }
    await page.locator('[data-note="induction"]').click();
    close(Number(await page.locator('#axial-a').innerText()), data.rates[1], .00051);
    close(Number(await page.locator('#axial-b').innerText()), data.rates[3], .00051);
    close(Number(await page.locator('#self-a').innerText()), .50802124, .00051);
    const before = await hash(page);
    for (const id of ['show-velocity','show-flow','show-circulation','show-trail']) await page.locator(`label:has(#${id})`).click();
    const after = await hash(page); assert.notEqual(before, after);
    if (mode === 'WebGL') {
      assert.deepEqual(await page.evaluate(() => ['vortex-velocity-a','vortex-velocity-b','vortex-streamlines','vortex-trail-a','vortex-circulation-b-0'].map(name => __vortexThree.scene.getObjectByName(name).visible)), [false,false,false,false,false]);
    }
    for (const id of ['show-velocity','show-flow','show-circulation','show-trail']) await page.locator(`label:has(#${id})`).click();
    await page.locator('[data-orientation="opposed"]').click(); await twoFrames(page);
    if (mode === 'WebGL') {
      const direction = await page.evaluate(() => new THREE.Vector3(0, 1, 0).applyQuaternion(__vortexThree.scene.getObjectByName('vortex-circulation-b-0').quaternion).toArray());
      closeArray(direction, [0, Math.sin(1.48), -Math.cos(1.48)]);
    }
    assert.deepEqual(errors, []);
  });

  test(`${mode}: ring drag resets from live geometry, empty drag orbits, and keyboard controls work`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchModel(page); await open(page); if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    await stepMany(page, 12); const old = await latest(page);
    const anchor = (await page.locator('#vortex-stage').getAttribute('data-ring-a-anchor')).split(',').map(Number);
    await page.mouse.move(anchor[0], anchor[1]); await page.mouse.down();
    await page.mouse.move(anchor[0] - 55, anchor[1], { steps: 8 }); await page.mouse.up(); await twoFrames(page);
    const changed = await latest(page);
    assert.equal(changed.steps, 0); assert.equal(await page.locator('#play-text').innerText(), '播放');
    close(changed.initial[0], old.state[0], 1e-10); close(changed.initial[2], old.state[2], 1e-10); close(changed.initial[3], old.state[3], 1e-10);
    assert.ok(changed.initial[1] < old.state[1] - .2); assert.equal(await page.locator('[data-ring="A"]').getAttribute('aria-pressed'), 'true');
    close(Number(await page.locator('#separation').inputValue()), changed.initial[3] - changed.initial[1], 1e-9);
    await page.locator('#reset').click(); closeArray((await latest(page)).initial, changed.initial, 1e-10);
    const firstAnchor = await page.locator('#vortex-stage').getAttribute('data-ring-a-anchor');
    await page.mouse.move(940, 200); await page.mouse.down(); await page.mouse.move(1000, 230, { steps: 6 }); await page.mouse.up(); await twoFrames(page);
    assert.notEqual(await page.locator('#vortex-stage').getAttribute('data-ring-a-anchor'), firstAnchor, 'dragging empty space changes camera');
    closeArray((await latest(page)).initial, changed.initial, 1e-10);
    await page.locator('#reset-view').click(); await twoFrames(page);
    assert.equal(await page.locator('#vortex-stage').getAttribute('data-ring-a-anchor'), firstAnchor);
    await page.locator('#vortex-scene').focus(); await page.keyboard.press('ArrowLeft'); await twoFrames(page);
    assert.notEqual(await page.locator('#vortex-stage').getAttribute('data-ring-a-anchor'), firstAnchor);
    await page.keyboard.press('Space'); assert.equal(await page.locator('#play-text').innerText(), '暂停');
    await page.keyboard.press('Space'); assert.equal(await page.locator('#play-text').innerText(), '播放');
    assert.deepEqual(errors, []);
  });

  test(`${mode}: cards, image export, navigation and offline file entry`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchModel(page); await open(page); if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    for (const note of ['chase','induction','compare','model']) {
      await page.locator(`[data-note="${note}"]`).click();
      assert.equal(await page.locator(`[data-note="${note}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator(`[data-note-content="${note}"]`).isVisible(), true);
    }
    await page.locator('[data-note="compare"]').click(); await page.locator('[data-try-preset="opposed"]').click();
    assert.deepEqual((await latest(page)).gamma, [2,-2]); assert.equal(await page.locator('#play-text').innerText(), '播放');
    const pending = page.waitForEvent('download'); await page.locator('#save-image').click(); const download = await pending;
    assert.equal(download.suggestedFilename(), 'chaos-lab-vortex-rings.png');
    assert.deepEqual(fs.readFileSync(await download.path()).subarray(0,8), Buffer.from([137,80,78,71,13,10,26,10]));
    await page.locator('#nav-toggle').click();
    assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(items => items.map(a => a.getAttribute('href'))), require('./navigation-fixtures.cjs')['vortex-filament.html']);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#lab-navigation').isVisible(), false);
    const external = []; page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
    await page.context().setOffline(true); await open(page, pathToFileURL(path.join(root,'vortex-filament.html')).href);
    assert.equal(await page.locator('#stage-error').isVisible(), false);
    assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), mode === 'WebGL' ? 'webgl' : 'canvas2d');
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
  });

  test(`${mode}: compact panels and a single touch drag retain control of the actual ring`, async t => {
    const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (mode === 'Canvas 2D') await disableWebGL(page);
    await watchModel(page); await open(page); if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    assert.equal(await page.locator('#control-panel').isVisible(), false); assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
    const anchor = (await page.locator('#vortex-stage').getAttribute('data-ring-a-anchor')).split(',').map(Number);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: anchor[0], y: anchor[1], id: 1 }] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: anchor[0] - i * 7, y: anchor[1], id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await twoFrames(page);
    assert.ok((await latest(page)).initial[1] < -.95); assert.equal(await page.locator('#play-text').innerText(), '播放');
    await page.locator('#toggle-controls').tap(); await page.locator('#control-panel').waitFor({ state: 'visible' });
    await page.locator('#toggle-knowledge').tap(); await page.locator('#knowledge-panel').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#control-panel').isVisible(), false);
    await page.locator('[data-note="compare"]').tap(); await page.locator('[data-try-preset="opposed"]').tap();
    assert.equal(await page.locator('#knowledge-panel').isVisible(), false); assert.deepEqual((await latest(page)).gamma, [2,-2]);
    for (const [width,height] of [[320,568],[390,844],[768,1024],[568,320],[1440,900]]) {
      await page.setViewportSize({ width,height });
      await page.waitForFunction(({width,height}) => {
        const stage = document.querySelector('#vortex-stage').getBoundingClientRect(), hud = document.querySelector('.lab-bottom').getBoundingClientRect();
        return innerWidth === width && innerHeight === height && Math.abs(stage.width - width) < 1 && Math.abs(stage.height - height) < 1 && hud.bottom <= height + 1;
      }, {width,height}); await twoFrames(page);
      const boxes = await page.evaluate(() => {
        const hud = document.querySelector('.lab-bottom').getBoundingClientRect(), top = document.querySelector('#lab-topbar').getBoundingClientRect(), s = document.querySelector('#vortex-stage');
        const points = ['ringAAnchor','ringBAnchor'].map(key => s.dataset[key].split(',').map(Number));
        return { hud:[hud.left,hud.top,hud.right,hud.bottom], top:[top.left,top.top,top.right,top.bottom], points, w:innerWidth,h:innerHeight };
      });
      assert.ok(boxes.hud[0] >= 0 && boxes.hud[2] <= width + .5 && boxes.hud[3] <= height + .5, JSON.stringify(boxes));
      assert.ok(boxes.top[0] >= 0 && boxes.top[2] <= width + .5, JSON.stringify(boxes));
      assert.ok(boxes.points.every(p => p.every(Number.isFinite)), JSON.stringify(boxes));
    }
    assert.deepEqual(errors, []);
  });
}

test('WebGL context loss replaces the canvas and preserves a usable paused model', async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
  await watchThree(page); await watchModel(page); await open(page); if (!await hasWebGL(page, t)) return;
  await stepMany(page, 8); const before = await latest(page);
  const supported = await page.evaluate(() => {
    window.__oldVortexCanvas = document.querySelector('#vortex-scene'); __oldVortexCanvas.focus();
    const ext = __vortexThree.renderer.getContext().getExtension('WEBGL_lose_context'); if (!ext) return false; ext.loseContext(); return true;
  });
  if (!supported) { t.skip('WEBGL_lose_context unavailable'); return; }
  await page.waitForFunction(() => document.querySelector('#vortex-stage').dataset.renderer === 'canvas2d', null, { timeout: 15000 }); await twoFrames(page);
  assert.equal(await page.evaluate(() => document.querySelector('#vortex-scene') !== __oldVortexCanvas), true);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'vortex-scene');
  assert.equal(await page.locator('#stage-fallback').isVisible(), true); assert.equal(await page.locator('#stage-error').isVisible(), false);
  closeArray((await latest(page)).state, before.state); await page.keyboard.press('Space'); assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await page.keyboard.press('Space'); assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.deepEqual(errors, []);
});

test('missing Three.js falls back to the same interactive Canvas model', async t => {
  const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/vendor/three.min.js*', route => route.abort()); await watchModel(page); await open(page);
  assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), 'canvas2d');
  await stepMany(page, 5); assert.equal((await latest(page)).steps, 10); assert.deepEqual(errors, []);
});

test('high-DPI Canvas dragging temporarily reduces draw resolution and restores it', async t => {
  const page = await newPage(t, { viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
  await disableWebGL(page); await watchModel(page); await open(page);
  await page.waitForFunction(() => document.querySelector('#vortex-scene').width === innerWidth * 2);
  await page.mouse.move(650, 200); await page.mouse.down(); await page.mouse.move(680, 220);
  await page.waitForFunction(() => document.querySelector('#vortex-scene').width === innerWidth);
  await page.mouse.up(); await page.waitForFunction(() => document.querySelector('#vortex-scene').width === innerWidth * 2);
});

for (const failure of ['initialization', 'exception', 'shader', 'blank']) {
  test(`${failure} WebGL failure falls back to a visible interactive projection`, async t => {
    const page = await newPage(t), errors = []; page.on('pageerror', e => errors.push(e.message));
    if (failure === 'initialization') {
      await page.addInitScript(() => {
        const old = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...args) { if (/^webgl/.test(kind)) throw new Error('synthetic WebGL initialization failure'); return old.call(this, kind, ...args); };
      });
    } else {
      await page.route('**/vortex.js*', async route => {
        const response = await route.fetch(), source = await response.text();
        const spy = `if (window.THREE) {
          const Original = THREE.WebGLRenderer;
          THREE.WebGLRenderer = function (...args) {
            const renderer = new Original(...args), render = renderer.render.bind(renderer);
            renderer.render = function (scene, camera) {
              if (${JSON.stringify(failure)} === 'exception' && window.__failNextVortex) throw new Error('synthetic draw failure');
              const result = render(scene, camera);
              if (${JSON.stringify(failure)} === 'shader' && window.__failNextVortex && renderer.info.programs.length) renderer.info.programs[0].diagnostics = { runnable: false };
              if (${JSON.stringify(failure)} === 'blank') { const gl = renderer.getContext(); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
              return result;
            }; return renderer;
          };
        }\n`;
        await route.fulfill({ response, body: spy + source });
      });
    }
    await watchModel(page); await open(page);
    if (failure !== 'initialization') {
      const available = await page.evaluate(() => !!(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')));
      if (!available) { t.skip('WebGL unavailable, so synthetic renderer failure cannot be injected'); return; }
    }
    if (failure === 'exception' || failure === 'shader') {
      assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), 'webgl');
      await stepMany(page, 5); const before = await latest(page);
      await page.evaluate(() => { window.__failNextVortex = true; }); await page.locator('#reset-view').click();
      await page.waitForFunction(() => document.querySelector('#vortex-stage').dataset.renderer === 'canvas2d');
      assert.equal((await latest(page)).steps, before.steps, 'fallback preserves the simulated state');
    }
    assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), 'canvas2d');
    assert.equal(await page.locator('#stage-fallback').isVisible(), true); assert.equal(await page.locator('#stage-error').isVisible(), false);
    const before = await hash(page); await page.locator('#vortex-scene').focus(); await page.keyboard.press('ArrowRight');
    assert.notEqual(await hash(page), before); const steps = (await latest(page)).steps;
    await page.locator('#step').click(); assert.equal((await latest(page)).steps, steps + 2); assert.deepEqual(errors, []);
  });
}

test('compact fallback fits the expanded rings between the caption and legend even with both notices', async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await disableWebGL(page); await watchModel(page); await open(page);
  await page.evaluate(() => { document.querySelector('[data-preset="opposed"]').click(); for (let i = 0; i < 200; i++) document.querySelector('#step').click(); });
  await page.waitForFunction(() => !document.querySelector('#stage-notice').hidden); await twoFrames(page);
  const box = await page.evaluate(() => {
    const canvas = document.querySelector('#vortex-scene'), c = canvas.getContext('2d'), ratio = canvas.width / canvas.clientWidth;
    const pixels = c.getImageData(0,0,canvas.width,canvas.height).data; let minY = Infinity, maxY = -Infinity, count = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
      const warm = r > g * 1.2 && r > b * 1.4, cool = g > r * 1.3 && b > r * 1.2;
      if (a > 45 && (warm || cool)) { minY = Math.min(minY,y / ratio); maxY = Math.max(maxY,y / ratio); count++; }
    }
    const stage = document.querySelector('#vortex-stage').getBoundingClientRect(), caption = document.querySelector('.vortex-caption').getBoundingClientRect(), legend = document.querySelector('.stage-bottom').getBoundingClientRect();
    const hud = document.querySelector('.lab-bottom').getBoundingClientRect(), notice = document.querySelector('#stage-notice');
    const n = notice.getBoundingClientRect(), reset = document.querySelector('#reset').getBoundingClientRect();
    return { minY,maxY,count,captionBottom:caption.bottom-stage.top,legendTop:legend.top-stage.top,hudTop:hud.top-stage.top,
      noticeInside: n.left >= 0 && n.right <= innerWidth && n.top >= 0 && n.bottom < reset.top,
      noticeFits: notice.scrollWidth <= notice.clientWidth + 1 && notice.scrollHeight <= notice.clientHeight + 1 };
  });
  assert.ok(box.count > 30 && box.minY >= box.captionBottom - 1 && box.maxY <= box.legendTop + 1 && box.legendTop < box.hudTop, JSON.stringify(box));
  assert.ok(box.noticeInside && box.noticeFits, JSON.stringify(box));
  await page.locator('#toggle-controls').tap(); await page.locator('[data-preset="chase"]').tap();
  assert.equal(await page.locator('#stage-notice').isVisible(), false); assert.equal(await page.locator('#play').isEnabled(), true);
});

test('WebGL framing keeps enlarged ring geometry clear of compact caption and legend', async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await watchThree(page); await watchModel(page); await open(page); if (!await hasWebGL(page,t)) return;
  await page.evaluate(() => { document.querySelector('[data-preset="opposed"]').click(); for (let i = 0; i < 200; i++) document.querySelector('#step').click(); });
  await page.waitForFunction(() => !document.querySelector('#stage-notice').hidden); await twoFrames(page);
  const box = await page.evaluate(() => {
    const sim = __vortexExperiments.at(-1), s = sim.state, center = (s[1] + s[3]) / 2, camera = __vortexThree.camera;
    const stage = document.querySelector('#vortex-stage').getBoundingClientRect(), caption = document.querySelector('.vortex-caption').getBoundingClientRect(), legend = document.querySelector('.stage-bottom').getBoundingClientRect();
    let minY = Infinity, maxY = -Infinity;
    function include(v) { const p = v.project(camera), y = (1 - p.y) * stage.height / 2; minY = Math.min(minY,y); maxY = Math.max(maxY,y); }
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 144; j++) { const a = j * Math.PI * 2 / 144; include(new THREE.Vector3(s[i*2+1]-center,s[i*2]*Math.cos(a),s[i*2]*Math.sin(a))); }
      const arrow = __vortexThree.scene.getObjectByName(i ? 'vortex-velocity-b' : 'vortex-velocity-a');
      const direction = new THREE.Vector3(0,1,0).applyQuaternion(arrow.quaternion); include(arrow.position.clone().addScaledVector(direction,arrow.cone.position.y));
    }
    return { minY,maxY,captionBottom:caption.bottom-stage.top,legendTop:legend.top-stage.top };
  });
  assert.ok(box.minY >= box.captionBottom - 2 && box.maxY <= box.legendTop + 2, JSON.stringify(box));
});

test('normal motion starts running and a hidden tab pauses without discarding its state', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference' });
  await disableWebGL(page); await watchModel(page); await open(page);
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await page.waitForFunction(() => __vortexExperiments.at(-1).steps >= 6, null, { timeout: 20000 });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  const steps = (await latest(page)).steps; await page.waitForTimeout(200); assert.equal((await latest(page)).steps, steps);
});

test('missing model and missing Canvas APIs leave actionable errors instead of a blank stage', async t => {
  const page = await newPage(t);
  await page.route('**/vortex-model.js*', route => route.abort()); await page.goto(base + 'vortex-filament.html');
  assert.match(await page.locator('#stage-error').innerText(), /模型加载失败/);
  await page.unroute('**/vortex-model.js*');
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = function () { return null; }; });
  await page.reload();
  assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), 'unavailable');
  assert.match(await page.locator('#stage-error').innerText(), /无法创建画布/);
  await page.locator('[data-preset="unequal"]').click(); assert.equal(await page.locator('#stage-error').isVisible(), true);
});

test('WebGL1 renders the vortex rings when WebGL2 is unavailable', async t => {
  const page = await newPage(t);
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return kind === 'webgl2' ? null : get.call(this, kind, ...args); };
  });
  await watchModel(page); await open(page);
  const available = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  if (!available) { t.skip('WebGL1 unavailable'); return; }
  assert.equal(await page.locator('#vortex-stage').getAttribute('data-renderer'), 'webgl');
  assert.equal(await page.locator('#stage-fallback').isVisible(), false); await stepMany(page, 2); assert.equal((await latest(page)).steps, 4);
});
