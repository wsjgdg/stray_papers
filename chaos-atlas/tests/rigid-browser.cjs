'use strict';
// Optional browser tests. Install playwright-core and supply Chromium with
// usable WebGL for the GPU cases; the application has no build dependency.
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
    if (name === '/') name = '/index.html';
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
    try {
      browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args });
      break;
    } catch (error) {
      if (attempt === 2 || !/signal=SIGSEGV/.test(String(error))) throw error;
    }
  }
  t.after(() => browser.close());
  return browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
}
async function disableWebGL(page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /^webgl/.test(kind) ? null : original.call(this, kind, ...args);
    };
  });
}
async function watchSimulation(page) {
  await page.addInitScript(() => {
    let api;
    Object.defineProperty(window, 'FreeRigidBody', {
      configurable: true, get() { return api; }, set(value) {
        const Original = value.FreeBody;
        function Tracked(...args) { const sim = new Original(...args); window.__rigidSim = sim; return sim; }
        Tracked.prototype = Original.prototype;
        value.FreeBody = Tracked;
        api = value;
      }
    });
  });
}
async function open(page) {
  await page.goto(base + 'rigid-body.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function twoFrames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function imageHash(page) {
  await twoFrames(page);
  const image = await page.locator('#rigid-scene').evaluate(canvas => canvas.toDataURL('image/png'));
  return createHash('sha256').update(image).digest('hex');
}
async function hasWebGL(page, t) {
  const available = await page.evaluate(() => !!(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')));
  if (!available) { t.skip('WebGL unavailable; use a browser with GPU or software WebGL'); return false; }
  assert.equal(await page.locator('#rigid-stage').getAttribute('data-renderer'), 'webgl', 'WebGL is available but the renderer fell back');
  return true;
}
async function modelCenter(page) {
  return page.evaluate(() => {
    const stage = document.querySelector('#rigid-stage').getBoundingClientRect(), w = stage.width, h = stage.height;
    const controls = document.querySelector('#control-panel'), knowledge = document.querySelector('#knowledge-panel');
    const hud = document.querySelector('.lab-bottom').getBoundingClientRect();
    let left = 48, right = w - 48, top = 102, bottom = h - 160;
    if (!controls.hidden) left = Math.max(left, controls.getBoundingClientRect().right - stage.left + 12);
    if (!knowledge.hidden) right = Math.min(right, knowledge.getBoundingClientRect().left - stage.left - 12);
    if (hud.width && hud.top - stage.top > top + 100) bottom = Math.min(bottom, hud.top - stage.top - 22);
    if (right - left < 110) { left = 44; right = w - 44; }
    if (bottom - top < 100) { top = 55; bottom = Math.max(top + 100, h - 95); }
    return { x: stage.left + (left + right) / 2, y: stage.top + (top + bottom) / 2 + (w > 700 ? Math.min(35, (bottom - top) * .06) : 0) };
  });
}
async function centerPixel(page) {
  const point = await modelCenter(page);
  return page.locator('#rigid-scene').evaluate((canvas, point) => {
    const r = canvas.getBoundingClientRect(), x = Math.floor((point.x - r.left) * canvas.width / r.width), y = Math.floor((point.y - r.top) * canvas.height / r.height);
    const ctx = canvas.getContext('2d');
    if (ctx) return Array.from(ctx.getImageData(x, y, 1, 1).data);
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), pixel = new Uint8Array(4);
    gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return Array.from(pixel);
  }, point);
}
async function assertVisibleModel(page) {
  await twoFrames(page);
  const pixel = await centerPixel(page);
  assert.ok(pixel[3] > 200 && Math.max(...pixel.slice(0, 3)) > 15, `center of the rigid body should be visible: ${pixel}`);
}
async function dragBody(page, dx, dy) {
  const p = await modelCenter(page);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 6 }); await page.mouse.up();
  await twoFrames(page);
}
async function setRange(page, id, value) {
  await page.locator(id).evaluate((input, next) => {
    input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}
async function setPanel(page, name, open) {
  const toggle = page.locator(name === 'controls' ? '#toggle-controls' : '#toggle-knowledge');
  if ((await toggle.getAttribute('aria-expanded')) !== String(open)) await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), String(open));
  if (open) {
    const selector = name === 'controls' ? '#control-panel' : '#knowledge-panel';
    await page.waitForFunction(sel => document.querySelector(sel).getBoundingClientRect().width > 100, selector);
  }
}
async function pngStats(page, file) {
  const data = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
  return page.evaluate(async src => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const c = canvas.getContext('2d'); c.drawImage(image, 0, 0);
    const corner = Array.from(c.getImageData(5, 5, 1, 1).data);
    const center = Array.from(c.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data);
    return { width: image.width, height: image.height, corner, center };
  }, data);
}

test('WebGL draws a real 3D body; camera, stepping and composite PNG work offline', async t => {
  const page = await newPage(t), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()); });
  await open(page);
  if (!await hasWebGL(page, t)) return;
  assert.equal(await page.locator('#stage-error').isVisible(), false);
  assert.equal(await page.locator('#stage-fallback').isVisible(), false);
  await assertVisibleModel(page);
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  await page.locator('#step').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.02 s');
  await page.locator('#reset-view').click(); const initial = await imageHash(page);
  await page.locator('#rigid-scene').focus(); await page.keyboard.press('ArrowRight');
  assert.notEqual(await imageHash(page), initial, 'arrow keys rotate the camera');
  await page.locator('#reset-view').click(); assert.equal(await imageHash(page), initial);
  await page.locator('#rigid-scene').focus(); await page.keyboard.press('+');
  assert.notEqual(await imageHash(page), initial, 'keyboard zoom changes the view');
  const pending = page.waitForEvent('download'); await page.locator('#save-image').click();
  const download = await pending, file = await download.path();
  assert.equal(download.suggestedFilename(), 'chaos-lab-rigid-body.png');
  assert.deepEqual(fs.readFileSync(file).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const stats = await pngStats(page, file);
  assert.deepEqual([stats.width, stats.height], [1440, 900]);
  assert.equal(stats.corner[3], 255, 'export includes an opaque background');
  assert.notDeepEqual(stats.center.slice(0, 3), stats.corner.slice(0, 3), 'export contains the rendered experiment');
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});

test('the selected intermediate-axis experiment actually flips while invariants remain accurate', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await open(page);
  assert.equal(await page.locator('[data-axis-preset="middle"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-speed="2"]').click(); await page.locator('#play').click();
  await page.waitForFunction(() => Number(document.querySelector('#flip-alignment').textContent) < -0.5, null, { timeout: 45000 });
  await page.locator('#play').click();
  assert.ok(parseFloat(await page.locator('#time-readout').innerText()) > 0);
  assert.match(await page.locator('#flip-line').getAttribute('d'), /L/);
  const metrics = await page.evaluate(() => ({
    energy: Math.abs(window.__rigidSim.energyError() / window.__rigidSim.initialEnergy),
    momentum: window.__rigidSim.momentumError() / Math.hypot(...window.__rigidSim.initialMomentum),
    alignment: window.__rigidSim.axisAlignment(window.FreeRigidBody.orderedAxes(window.__rigidSim.inertia).order[1])
  }));
  assert.ok(metrics.alignment < -0.5 && metrics.energy < 1e-6 && metrics.momentum < 1e-6, JSON.stringify(metrics));
  await page.locator('[data-note="conservation"]').click();
  assert.equal(await page.locator('[data-note-content="conservation"]').isVisible(), true);
  assert.match(await page.locator('#momentum-drift').innerText(), /e/);
  await page.locator('#reset').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  assert.ok(Number(await page.locator('#flip-alignment').innerText()) > 0.9);
  assert.deepEqual(errors, []);
});

test('inertia constraints, equal axes, presets and initial spin controls drive the actual model', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await open(page);
  await page.locator('[data-axis-preset="small"]').click();
  assert.equal(await page.locator('#omega-x-value').innerText(), '3.20');
  assert.equal(await page.locator('[data-axis-preset="small"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-axis-preset="large"]').click();
  assert.equal(await page.locator('#omega-z-value').innerText(), '3.20');
  await setRange(page, '#inertia-x', 2.6);
  assert.equal(await page.locator('#inertia-x-value').innerText(), '2.60');
  assert.equal(await page.locator('[data-axis-preset="middle"]').isDisabled(), true);
  assert.match(await page.locator('#preset-note').innerText(), /没有唯一的中间轴/);
  assert.equal(await page.locator('#alignment-readout').innerText(), '—');
  assert.match(await page.locator('#axis-order').innerText(), /=/);
  await setRange(page, '#inertia-x', 1);
  assert.equal(await page.locator('[data-axis-preset="middle"]').isEnabled(), true);
  await setRange(page, '#inertia-z', 3);
  const result = await page.evaluate(() => ({
    inertia: window.__rigidSim.inertia, valid: window.FreeRigidBody.validInertia(window.__rigidSim.inertia),
    max: Number(document.querySelector('#inertia-z').max)
  }));
  assert.equal(result.valid, true);
  assert.ok(result.inertia[2] <= result.max && result.inertia[2] < result.inertia[0] + result.inertia[1]);
  await setRange(page, '#omega-y', -1.5);
  assert.equal(await page.locator('#omega-y-value').innerText(), '-1.50');
  assert.equal(await page.evaluate(() => window.__rigidSim.omega()[1]), -1.5);
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  // Reorder the distinct axes: the middle axis is X, not always Y.
  await setRange(page, '#inertia-z', 1.5);
  await setRange(page, '#inertia-x', 1.5);
  await setRange(page, '#inertia-z', 1);
  assert.equal(await page.locator('#axis-order').innerText(), 'Z < X < Y');
  await page.locator('[data-axis-preset="middle"]').click();
  assert.equal(await page.locator('#omega-x-value').innerText(), '3.20');
  assert.match(await page.locator('#flip-axis-label').innerText(), /中间轴 X/);
  for (const axis of ['x', 'y', 'z']) await setRange(page, '#omega-' + axis, 0);
  assert.equal(await page.locator('#momentum-readout').innerText(), '0.00 kg·m²/s');
  assert.equal(await page.locator('#omega-magnitude').innerText(), '0.00 rad/s');
  assert.equal(await page.locator('#alignment-readout').innerText(), '—');
  assert.equal(await page.locator('#flip-last').getAttribute('visibility'), 'hidden');
  await page.locator('#step').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.02 s');
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D fallback']) {
  test(`${mode}: dragging the body changes initial orientation, while background drag changes only the view`, async t => {
    const page = await newPage(t), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (mode !== 'WebGL') await disableWebGL(page);
    await watchSimulation(page); await open(page);
    if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
    if (mode !== 'WebGL') assert.equal(await page.locator('#rigid-stage').getAttribute('data-renderer'), 'canvas2d');
    await assertVisibleModel(page);
    await page.locator('#step').click();
    const p = await modelCenter(page); await page.mouse.move(p.x, p.y);
    assert.equal(await page.locator('#rigid-scene').evaluate(c => getComputedStyle(c).cursor), 'pointer');
    const before = await page.evaluate(() => ({ q: window.__rigidSim.orientation(), initialOmega: ['x', 'y', 'z'].map(axis => Number(document.querySelector('#omega-' + axis).value)) }));
    await dragBody(page, 75, 50);
    const dragged = await page.evaluate(() => ({ q: window.__rigidSim.orientation(), omega: window.__rigidSim.omega() }));
    assert.notDeepEqual(dragged.q, before.q, 'body drag sets a new orientation');
    assert.deepEqual(dragged.omega, before.initialOmega, 'drag resets the trajectory without changing initial angular velocity');
    assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
    assert.equal(await page.locator('#play-text').innerText(), '播放');
    await page.locator('#rigid-scene').focus(); await page.keyboard.press('Alt+ArrowRight');
    assert.notDeepEqual(await page.evaluate(() => window.__rigidSim.orientation()), dragged.q, 'keyboard also sets a 3D initial orientation');
    await page.locator('#reset-pose').click(); await page.locator('#reset-view').click();
    const original = await imageHash(page), q = await page.evaluate(() => window.__rigidSim.orientation());
    await page.mouse.move(420, 225); await page.mouse.down(); await page.mouse.move(480, 255, { steps: 5 }); await page.mouse.up();
    assert.notEqual(await imageHash(page), original);
    assert.deepEqual(await page.evaluate(() => window.__rigidSim.orientation()), q, 'camera motion must not alter physical orientation');
    await page.locator('#reset-view').click(); assert.equal(await imageHash(page), original);
    assert.deepEqual(errors, []);
  });
}

test('knowledge cards, visual switches and panel re-opening are connected to the experiment', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  const original = await imageHash(page);
  for (const id of ['show-axes', 'show-momentum', 'show-omega', 'show-trail']) {
    await page.locator(`label:has(#${id})`).click(); assert.equal(await page.locator('#' + id).isChecked(), false);
  }
  assert.notEqual(await imageHash(page), original);
  for (const id of ['show-axes', 'show-momentum', 'show-omega', 'show-trail']) {
    await page.locator(`label:has(#${id})`).click(); assert.equal(await page.locator('#' + id).isChecked(), true);
  }
  assert.equal(await imageHash(page), original);
  for (const note of ['conservation', 'inertia', 'equations', 'flip']) {
    await page.locator(`[data-note="${note}"]`).click();
    assert.equal(await page.locator(`[data-note="${note}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator(`[data-note-content="${note}"]`).isVisible(), true);
  }
  const previous = await page.locator('#flip-line').getAttribute('d');
  await setPanel(page, 'knowledge', false);
  await page.evaluate(() => { for (let i = 0; i < 18; i++) document.querySelector('#step').click(); });
  await setPanel(page, 'knowledge', true);
  await page.waitForFunction(before => {
    const chart = document.querySelector('#flip-chart'), rect = chart.getBoundingClientRect();
    return rect.width > 100 && Math.abs(chart.viewBox.baseVal.width - rect.width) < .1 && document.querySelector('#flip-line').getAttribute('d') !== before;
  }, previous);
  await page.locator('[data-try-axis="middle"]').click();
  assert.equal(await page.locator('[data-axis-preset="middle"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D fallback']) test(`${mode}: workbench, transport and navigation fit desktop, portrait and short landscape screens`, async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode !== 'WebGL') await disableWebGL(page);
  await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [568, 320], [800, 500], [901, 768], [1024, 768], [1101, 850], [1200, 1100], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(([w, h]) => {
      const r = document.querySelector('#rigid-stage').getBoundingClientRect();
      return r.width === w && r.height === h;
    }, [width, height]);
    await twoFrames(page);
    const layout = await page.evaluate(() => {
      const rect = node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      const stage = document.querySelector('#rigid-stage').getBoundingClientRect();
      const toolbar = document.querySelector('.transport').getBoundingClientRect();
      const hud = document.querySelector('.lab-bottom').getBoundingClientRect();
      const clipped = [...document.querySelectorAll('.transport button')].filter(button => {
        const r = button.getBoundingClientRect();
        return r.left < toolbar.left - 1 || r.right > toolbar.right + 1 || r.top < toolbar.top - 1 || r.bottom > toolbar.bottom + 1;
      }).map(button => button.id || button.textContent.trim());
      const compact = matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)').matches;
      const intersectsHud = r => r.left < hud.right && r.right > hud.left && r.top < hud.bottom && r.bottom > hud.top;
      const overlap = [...document.querySelectorAll('.side-shell.closed .side-toggle')].filter(button => intersectsHud(button.getBoundingClientRect())).map(button => button.id);
      const legend = document.querySelector('.stage-bottom').getBoundingClientRect();
      const legendOverlap = legend.width > 0 && intersectsHud(legend);
      const telemetryOverflow = [...document.querySelectorAll('.telemetry-item strong, .telemetry-item > span')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent.trim());
      return { stage: [stage.x, stage.y, stage.width, stage.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], hud: rect(document.querySelector('.lab-bottom')), message: rect(document.querySelector('#stage-fallback')), clipped, overlap, legendOverlap, telemetryOverflow, compact,
        controls: !document.querySelector('#control-panel').hidden, knowledge: !document.querySelector('#knowledge-panel').hidden };
    });
    assert.deepEqual(layout.stage, [0, 0, width, height], `stage fills ${width}×${height}`);
    assert.deepEqual(layout.scroll, [width, height], `no document overflow at ${width}×${height}`);
    assert.ok(layout.hud[0] >= 0 && layout.hud[1] >= 0 && layout.hud[2] <= width && layout.hud[3] <= height, `HUD fits ${width}×${height}: ${JSON.stringify(layout)}`);
    assert.deepEqual(layout.clipped, [], `playback controls fit ${width}×${height}`);
    assert.deepEqual(layout.telemetryOverflow, [], `telemetry must not clip at ${width}×${height}`);
    assert.deepEqual(layout.overlap, [], `collapsed tabs must not cover telemetry or playback at ${width}×${height}`);
    assert.equal(layout.legendOverlap, false, `legend must not sit underneath the HUD at ${width}×${height}`);
    if (mode !== 'WebGL') assert.ok(layout.message[0] >= layout.hud[0] && layout.message[2] <= layout.hud[2] && layout.message[1] >= layout.hud[1] && layout.message[3] <= layout.hud[3], 'fallback notice belongs in the instrument bar, not over the model');
    assert.equal(layout.controls, !layout.compact); assert.equal(layout.knowledge, !layout.compact);
    const p = await modelCenter(page), hit = await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.id, p);
    assert.equal(hit, 'rigid-scene', `model center must remain reachable at ${width}×${height}`);
    await assertVisibleModel(page);
    await page.locator('#nav-toggle').click();
    const nav = await page.evaluate(() => {
      const n = document.querySelector('#lab-navigation').getBoundingClientRect();
      return { rect: [n.left, n.top, n.right, n.bottom], clipped: [...document.querySelectorAll('#lab-navigation a')].filter(a => {
        const r = a.getBoundingClientRect(), text = a.querySelector('span').getBoundingClientRect();
        return r.left < n.left || r.right > n.right || text.left < r.left - 1 || text.right > r.right + 1 || r.bottom > innerHeight;
      }).map(a => a.textContent.trim()) };
    });
    assert.ok(nav.rect[0] >= 0 && nav.rect[2] <= width && nav.rect[3] <= height, `navigation fits ${width}×${height}`);
    assert.deepEqual(nav.clipped, [], `navigation entries fit ${width}×${height}`);
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors, []);
});

test('mobile drawers and touch dragging preserve a usable experiment', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await open(page);
  assert.equal(await page.locator('#toggle-controls').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#toggle-knowledge').getAttribute('aria-expanded'), 'false');
  await page.locator('#toggle-controls').tap();
  await page.waitForFunction(() => document.querySelector('#controls-shell').classList.contains('has-more'));
  await page.locator('#control-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('#controls-shell').classList.contains('has-more'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollTop), 0);
  await page.locator('#toggle-knowledge').tap();
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), true);
  await page.waitForFunction(() => {
    const chart = document.querySelector('#flip-chart'), rect = chart.getBoundingClientRect();
    return rect.width > 100 && Math.abs(chart.viewBox.baseVal.width - rect.width) < .1;
  });
  await page.locator('[data-note="equations"]').tap();
  assert.equal(await page.locator('[data-note-content="equations"]').isVisible(), true);
  await page.locator('#toggle-knowledge').tap();
  const point = await modelCenter(page), before = await page.evaluate(() => window.__rigidSim.orientation());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 45 * i / 8, y: point.y + 35 * i / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.notDeepEqual(await page.evaluate(() => window.__rigidSim.orientation()), before);
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  // Separate the synthetic drag from the next tap so Chromium's gesture
  // recognizer does not merge two CDP-generated touch sequences.
  await page.waitForTimeout(500);
  await page.locator('#toggle-controls').tap();
  await page.waitForFunction(() => document.querySelector('#control-panel').getBoundingClientRect().width > 100);
  await page.locator('#inertia-x').focus();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'inertia-x');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-controls');
  assert.deepEqual(errors, []);
});

test('high-DPI dragging reduces render resolution temporarily and restores it', async t => {
  const page = await newPage(t, { viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page); await open(page);
  await page.waitForFunction(() => document.querySelector('#rigid-scene').width === innerWidth * 2);
  const point = await modelCenter(page); await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + 30, point.y + 20);
  await page.waitForFunction(() => document.querySelector('#rigid-scene').width === innerWidth);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#rigid-scene').width === innerWidth * 2);
  await assertVisibleModel(page);
  assert.deepEqual(errors, []);
});

test('the top navigation connects the other experiments and dismissal preserves live state', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await setPanel(page, 'controls', false); await setPanel(page, 'knowledge', false);
  await page.locator('#step').click(); const time = await page.locator('#time-readout').innerText();
  await page.locator('#nav-toggle').click();
  assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(items => items.map(item => item.getAttribute('href'))), require('./navigation-fixtures.cjs')['rigid-body.html']);
  assert.equal(await page.locator('#lab-navigation [aria-current="page"]').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#lab-navigation').isVisible(), false);
  assert.equal(await page.locator('#time-readout').innerText(), time);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'nav-toggle');
  const menus = require('./navigation-fixtures.cjs');
  for (const file of ['index.html', 'attractors.html', 'rigid-body.html', 'henon-heiles.html', 'vortex-rings.html', 'turing-patterns.html', 'rigid-body.html']) {
    await page.locator('#nav-toggle').click(); await page.locator(`#lab-navigation a[href="${file}"]`).click();
    assert.ok(page.url().endsWith('/' + file), `navigated to ${file}`);
    assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(items => items.map(item => item.getAttribute('href'))), menus[file]);
  }
  await assertVisibleModel(page);
  assert.deepEqual(errors, []);
});

test('reduced-motion starts paused; playback, single-step and reset retain their semantics', async t => {
  const page = await newPage(t, { reducedMotion: 'reduce' }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await open(page);
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.equal(await page.locator('#step').isEnabled(), true);
  await page.locator('#step').click();
  assert.equal(await page.evaluate(() => window.__rigidSim.steps), 4);
  await page.locator('#play').click();
  assert.equal(await page.locator('#step').isDisabled(), true);
  await page.waitForFunction(() => window.__rigidSim.steps > 12, null, { timeout: 30000 });
  await page.locator('#play').click();
  const pausedSteps = await page.evaluate(() => window.__rigidSim.steps);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__rigidSim.steps), pausedSteps);
  await page.locator('#step').click(); assert.equal(await page.evaluate(() => window.__rigidSim.steps), pausedSteps + 4);
  await page.locator('#reset').click(); assert.equal(await page.evaluate(() => window.__rigidSim.steps), 0);
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  await page.locator('#rigid-scene').focus(); await page.keyboard.press('Space');
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await page.keyboard.press('Space'); assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.deepEqual(errors, []);
});

test('normal motion starts playing and can pause before interaction', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference' }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await open(page);
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await page.waitForFunction(() => window.__rigidSim.steps > 12, null, { timeout: 30000 });
  await page.locator('#play').click();
  assert.equal(await page.locator('#step').isEnabled(), true);
  assert.deepEqual(errors, []);
});

test('Canvas 2D fallback exports a complete PNG and works without Three.js', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({ contentType: 'text/javascript', body: '/* simulate unavailable Three.js */' }));
  await open(page);
  assert.equal(await page.locator('#rigid-stage').getAttribute('data-renderer'), 'canvas2d');
  assert.equal(await page.locator('#stage-fallback').isVisible(), true);
  await assertVisibleModel(page);
  const pending = page.waitForEvent('download'); await page.locator('#save-image').click();
  const download = await pending, stats = await pngStats(page, await download.path());
  assert.equal(download.suggestedFilename(), 'chaos-lab-rigid-body.png');
  assert.equal(stats.corner[3], 255); assert.notDeepEqual(stats.corner.slice(0, 3), stats.center.slice(0, 3));
  assert.deepEqual(errors, []);
});

test('a real lost WebGL context retains the trajectory and switches to an interactive projection', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference' }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await open(page);
  if (!await hasWebGL(page, t)) return;
  await page.waitForFunction(() => window.__rigidSim.steps > 12, null, { timeout: 30000 });
  const before = await page.evaluate(() => window.__rigidSim.steps);
  const triggered = await page.locator('#rigid-scene').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false; extension.loseContext(); return true;
  });
  assert.equal(triggered, true);
  await page.waitForFunction(() => document.querySelector('#rigid-stage').dataset.renderer === 'canvas2d');
  assert.equal(await page.locator('#stage-fallback').isVisible(), true);
  await page.waitForFunction(steps => window.__rigidSim.steps > steps, before, { timeout: 30000 });
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await assertVisibleModel(page);
  await dragBody(page, 50, 40);
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  assert.deepEqual(errors, []);
});

for (const failure of ['initialization', 'exception', 'shader', 'blank']) {
  test(`${failure} WebGL failure automatically falls back without a blank model`, async t => {
    const page = await newPage(t), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const wrapper = failure === 'initialization' ? `
      window.THREE.Scene = class { constructor() { throw new Error('test initialization failure'); } };
    ` : `
      { const Original = window.THREE.WebGLRenderer;
        window.THREE.WebGLRenderer = function (...args) {
          const renderer = new Original(...args), render = renderer.render.bind(renderer);
          renderer.render = function (...values) {
            if (${JSON.stringify(failure)} === 'exception' && window.__failNextRender) throw new Error('test render failure');
            render(...values);
            if (${JSON.stringify(failure)} === 'shader' && window.__failNextRender && renderer.info.programs.length) renderer.info.programs[0].diagnostics = { runnable: false };
            if (${JSON.stringify(failure)} === 'blank') { const gl = renderer.getContext(); gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); }
          };
          return renderer;
        };
      }
    `;
    await page.route('**/vendor/three.min.js*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + '\n;' + wrapper }));
    await watchSimulation(page); await open(page);
    const available = await page.evaluate(() => !!(document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl')));
    if (!available) { t.skip('requires a WebGL context to inject renderer failure'); return; }
    if (failure === 'exception' || failure === 'shader') {
      assert.equal(await page.locator('#rigid-stage').getAttribute('data-renderer'), 'webgl');
      await page.locator('#step').click(); const before = await page.evaluate(() => window.__rigidSim.steps);
      await page.evaluate(() => { window.__failNextRender = true; });
      await page.locator('#reset-view').click();
      await page.waitForFunction(() => document.querySelector('#rigid-stage').dataset.renderer === 'canvas2d');
      assert.equal(await page.evaluate(() => window.__rigidSim.steps), before, 'falling back must not reset physics');
    }
    assert.equal(await page.locator('#rigid-stage').getAttribute('data-renderer'), 'canvas2d');
    assert.equal(await page.locator('#stage-fallback').isVisible(), true);
    assert.equal(await page.locator('#stage-error').isVisible(), false);
    await assertVisibleModel(page);
    const beforePose = await page.evaluate(() => window.__rigidSim.orientation());
    await dragBody(page, 45, 30);
    assert.notDeepEqual(await page.evaluate(() => window.__rigidSim.orientation()), beforePose);
    assert.deepEqual(errors, []);
  });
}

test('missing canvas and model resources leave actionable error messages', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await open(page);
  assert.equal(await page.locator('#rigid-stage').getAttribute('data-renderer'), 'unavailable');
  assert.match(await page.locator('#stage-error').innerText(), /无法创建画布/);
  await setRange(page, '#omega-x', 1);
  assert.equal(await page.locator('#stage-error').isVisible(), true);
  await page.route('**/rigid-model.js*', route => route.fulfill({ contentType: 'text/javascript', body: '/* missing model */' }));
  await open(page);
  assert.match(await page.locator('#stage-error').innerText(), /模型加载失败.*刷新/);
  await page.unroute('**/rigid-model.js*');
  await page.route('**/rigid-body.js*', route => route.fulfill({ contentType: 'text/javascript', body: '/* missing entry */' }));
  await open(page);
  assert.match(await page.locator('#stage-error').innerText(), /加载.*刷新/);
  assert.deepEqual(errors, []);
});

test('direct file access works with the browser offline and makes no network requests', async t => {
  const page = await newPage(t), external = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await page.context().setOffline(true);
  await page.goto(pathToFileURL(path.join(root, 'rigid-body.html')).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready); await twoFrames(page);
  assert.equal(await page.locator('#stage-error').isVisible(), false);
  await assertVisibleModel(page);
  await page.locator('#step').click(); assert.equal(await page.locator('#time-readout').innerText(), '0.02 s');
  const before = await page.evaluate(() => window.__rigidSim.orientation());
  await dragBody(page, 40, 40);
  assert.notDeepEqual(await page.evaluate(() => window.__rigidSim.orientation()), before);
  await page.locator('label:has(#enable-force)').click();
  await setRange(page, '#force-magnitude', 2);
  await page.locator('#step').click();
  assert.ok(Math.hypot(...await page.evaluate(() => window.__rigidSim.velocity())) > 0, 'offline force controls affect the physical model');
  const stateBefore = await page.evaluate(() => ({ state: Array.from(window.__rigidSim.state), steps: window.__rigidSim.steps }));
  await page.locator('[data-force-direction="nx"]').click();
  assert.deepEqual(await page.evaluate(() => ({ state: Array.from(window.__rigidSim.state), steps: window.__rigidSim.steps })), stateBefore, 'offline force edits also preserve motion');
  assert.ok((await page.evaluate(() => window.__rigidSim.force[0])) < -1.99);
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
});

test('WebGL1 also renders a real box when WebGL2 is unavailable', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === 'webgl2' ? null : original.call(this, kind, ...args);
    };
  });
  await open(page);
  const available = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  if (!available) { t.skip('WebGL1 unavailable'); return; }
  assert.equal(await page.locator('#rigid-stage').getAttribute('data-renderer'), 'webgl');
  assert.equal(await page.locator('#stage-fallback').isVisible(), false);
  await assertVisibleModel(page);
  assert.deepEqual(errors, []);
});

test('all six workbenches and the vortex comparison consistently version local application assets', () => {
  const applicationAssets = new Set(['pendulum.css', 'styles.css', 'rigid.css', 'henon.css', 'vortex.css', 'fluid.css', 'turing.css', 'spatial-model.js', 'pendulum.js', 'model.js', 'lab-shell.js', 'atlas-renderer.js', 'app.js', 'atlas-notes.js', 'rigid-model.js', 'rigid-body.js', 'henon-model.js', 'henon.js', 'vortex-model.js', 'vortex.js', 'fluid-model.js', 'fluid-analysis.js', 'fluid.js', 'turing-model.js', 'turing.js']);
  const versions = [], seen = new Set();
  for (const name of ['index.html', 'attractors.html', 'rigid-body.html', 'henon-heiles.html', 'vortex-rings.html', 'vortex-filament.html', 'turing-patterns.html']) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^\"]+)"/g)) {
      const url = new URL(match[1], 'https://local.invalid/'), asset = url.pathname.slice(1);
      if (!applicationAssets.has(asset)) continue;
      const version = url.searchParams.get('v');
      assert.ok(version, `${name}: ${url.pathname} needs a cache version`);
      seen.add(asset); versions.push(version);
    }
  }
  assert.deepEqual([...seen].sort(), [...applicationAssets].sort(), 'every expected local application asset is referenced');
  assert.equal(new Set(versions).size, 1, 'shared and page-specific application assets use the same version');
});

for (const mode of ['WebGL', 'Canvas 2D fallback']) test(`${mode}: adjustable constant force drives translation and the selected point controls torque`, async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode !== 'WebGL') await disableWebGL(page);
  await watchSimulation(page); await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  assert.equal(await page.locator('#enable-force').isChecked(), false);
  assert.equal(await page.locator('#force-controls').isVisible(), false);
  assert.equal(await page.locator('#world-frame').isVisible(), false);
  await page.locator('label:has(#enable-force)').click();
  assert.equal(await page.locator('#force-controls').isVisible(), true);
  assert.equal(await page.locator('#world-frame').isVisible(), true);
  assert.equal(await page.locator('#force-legend').isVisible(), true);
  assert.match(await page.locator('#caption-mode').innerText(), /跟随质心/);
  await setRange(page, '#force-magnitude', 2);
  await setRange(page, '#force-azimuth', 90);
  await setRange(page, '#force-elevation', 0);
  await page.locator('[data-force-point="center"]').click();
  assert.equal(await page.locator('[data-force-point="center"]').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#force-point-help').innerText(), /不产生绕质心的力矩/);
  assert.match(await page.locator('#force-components').innerText(), /\(0\.00, 0\.00, 2\.00\)/);
  const initial = await page.evaluate(() => ({ inertia: window.__rigidSim.inertia, omega: window.__rigidSim.omega(), q: window.__rigidSim.orientation() }));
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); });
  const centered = await page.evaluate(() => ({
    position: window.__rigidSim.position(), velocity: window.__rigidSim.velocity(), q: window.__rigidSim.orientation(),
    torque: Math.hypot(...window.__rigidSim.worldTorque()), energy: window.__rigidSim.mechanicalEnergyError(), impulse: window.__rigidSim.linearMomentumError()
  }));
  assert.ok(Math.abs(centered.position[2] - 1) < 1e-9 && Math.abs(centered.velocity[2] - 2) < 1e-9);
  assert.ok(centered.torque < 1e-12 && Math.abs(centered.energy) < 1e-7 && centered.impulse < 1e-9, JSON.stringify(centered));
  const Model = require('../rigid-model.js'), reference = new Model.FreeBody(initial.inertia, initial.omega, initial.q);
  for (let i = 0; i < 240; i++) reference.step();
  centered.q.forEach((value, i) => assert.ok(Math.abs(value - reference.orientation()[i]) < 1e-10, 'a force through the center must not affect spin'));
  assert.equal(await page.locator('#force-position').innerText(), '1.00 m');
  assert.equal(await page.locator('#force-velocity').innerText(), '2.00 m/s');
  const beforeChange = await page.evaluate(() => Array.from(window.__rigidSim.state));
  await setRange(page, '#force-azimuth', 0); await setRange(page, '#force-elevation', 30);
  assert.equal(await page.locator('#time-readout').innerText(), '1.00 s', 'changing the force preserves the running experiment');
  assert.deepEqual(await page.evaluate(() => Array.from(window.__rigidSim.state)), beforeChange);
  assert.match(await page.locator('#force-components').innerText(), /\(1\.73, 1\.00, 0\.00\)/);
  await page.locator('[data-force-point="surface"]').click();
  assert.equal(await page.locator('[data-force-point="surface"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(() => Array.from(window.__rigidSim.state)), beforeChange, 'changing the application point does not change motion instantaneously');
  const initialForced = await page.evaluate(() => ({ force: window.__rigidSim.force, point: window.__rigidSim.point, torque: window.__rigidSim.worldTorque(), position: window.__rigidSim.position(), velocity: window.__rigidSim.velocity() }));
  assert.ok(Math.hypot(...initialForced.torque) > 2, JSON.stringify(initialForced));
  await page.evaluate(() => { for (let i = 0; i < 120; i++) document.querySelector('#step').click(); });
  const offcenter = await page.evaluate(() => ({
    force: window.__rigidSim.force, position: window.__rigidSim.position(), velocity: window.__rigidSim.velocity(),
    energy: window.__rigidSim.mechanicalEnergyError(), impulse: window.__rigidSim.linearMomentumError(), angularChange: window.__rigidSim.momentumError()
  }));
  assert.deepEqual(offcenter.force, initialForced.force, 'world-frame force remains constant while the body rotates');
  offcenter.force.forEach((value, i) => {
    assert.ok(Math.abs(offcenter.position[i] - (initialForced.position[i] + 2 * initialForced.velocity[i] + 2 * value)) < 1e-9, 'position follows Newton’s law from the changed-force state');
    assert.ok(Math.abs(offcenter.velocity[i] - (initialForced.velocity[i] + 2 * value)) < 1e-9, 'velocity follows Newton’s law from the changed-force state');
  });
  assert.ok(Math.abs(offcenter.energy) < 1e-6 && offcenter.impulse < 1e-9 && offcenter.angularChange > .1, JSON.stringify(offcenter));
  await assertVisibleModel(page);
  const axisBefore = await page.locator('#world-x').getAttribute('x2'), forceBefore = offcenter.force;
  await page.locator('#rigid-scene').focus(); await page.keyboard.press('ArrowRight'); await twoFrames(page);
  assert.notEqual(await page.locator('#world-x').getAttribute('x2'), axisBefore, 'world-frame compass follows the camera');
  assert.deepEqual(await page.evaluate(() => window.__rigidSim.force), forceBefore, 'camera changes do not rotate a world-fixed force');
  await page.locator('[data-note="conservation"]').click();
  assert.equal(await page.locator('#conservation-forced').isVisible(), true);
  assert.equal(await page.locator('#forced-energy-formula').isVisible(), true);
  assert.match(await page.locator('#forced-energy-formula').innerText(), /vₛ/);
  assert.match(await page.locator('#conservation-segment').innerText(), /1\.00 s/);
  assert.match(await page.locator('#momentum-drift-label').innerText(), /动量定理/);
  await page.locator('[data-note="flip"]').click();
  assert.equal(await page.locator('#flip-force-note').isVisible(), true);
  await page.waitForFunction(() => document.querySelector('#flip-segment-line').getAttribute('visibility') === 'visible');
  assert.equal(await page.locator('#flip-segment-caption').isVisible(), true);
  const marker = await page.evaluate(() => ({ x: Number(document.querySelector('#flip-segment-line').getAttribute('x1')), width: document.querySelector('#flip-chart').viewBox.baseVal.width }));
  assert.ok(Math.abs(marker.x - (26 + (marker.width - 4 - 26) / 3)) < .2, 'the chart marks the force change at t = 1 s of the 3 s history');
  const beforePose = await page.evaluate(() => window.__rigidSim.orientation());
  await dragBody(page, 40, 35);
  assert.notDeepEqual(await page.evaluate(() => window.__rigidSim.orientation()), beforePose, 'moving body stays draggable');
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  assert.equal(await page.locator('#flip-segment-line').getAttribute('visibility'), 'hidden', 'a true reset clears the force-change marker');
  assert.equal(await page.locator('#flip-segment-caption').isVisible(), false);
  assert.deepEqual(await page.evaluate(() => window.__rigidSim.force), forceBefore);
  await setRange(page, '#force-magnitude', 0);
  assert.equal(await page.locator('#world-frame').isVisible(), false);
  assert.equal(await page.locator('#force-legend').isVisible(), false);
  assert.equal(await page.locator('#flip-force-note').isVisible(), false);
  assert.equal(await page.locator('#force-components').innerText(), '(0.00, 0.00, 0.00) N');
  await setRange(page, '#force-magnitude', 1);
  assert.match(await page.locator('[data-try-axis="middle"]').innerText(), /关闭恒力/);
  await page.locator('[data-try-axis="middle"]').click();
  assert.equal(await page.locator('#enable-force').isChecked(), false, 'the free-rotation lesson explicitly turns off force');
  assert.deepEqual(await page.evaluate(() => window.__rigidSim.force), [0, 0, 0]);
  assert.equal(await page.locator('#force-controls').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('the WebGL force arrow originates at the rotating application point and follows the fixed world force', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + `
    ;{ const Original = window.THREE.WebGLRenderer;
      window.THREE.WebGLRenderer = function (...args) {
        const renderer = new Original(...args), render = renderer.render.bind(renderer);
        renderer.render = function (scene, camera) { window.__forceScene = scene; window.__forceCamera = camera; return render(scene, camera); };
        return renderer;
      };
    }
  ` }));
  await watchSimulation(page); await open(page);
  if (!await hasWebGL(page, t)) return;
  assert.equal(await page.evaluate(() => window.__forceScene.getObjectByName('constant-force').visible), false);
  await page.locator('label:has(#enable-force)').click(); await twoFrames(page);
  const lengthAtOne = await page.evaluate(() => window.__forceScene.getObjectByName('constant-force').cone.position.y);
  await setRange(page, '#force-magnitude', 3); await twoFrames(page);
  const lengthAtThree = await page.evaluate(() => window.__forceScene.getObjectByName('constant-force').cone.position.y);
  assert.ok(lengthAtThree > lengthAtOne * 2.9, 'force-arrow length visibly reflects the selected magnitude');
  await setRange(page, '#force-magnitude', 1);
  await page.evaluate(() => { for (let i = 0; i < 120; i++) document.querySelector('#step').click(); }); await twoFrames(page);
  const snapshot = await page.evaluate(() => {
    const sim = window.__rigidSim, arrow = window.__forceScene.getObjectByName('constant-force'), frame = window.__forceScene.getObjectByName('rigid-frame');
    const path = window.__forceScene.getObjectByName('center-trajectory'), count = path.geometry.drawRange.count;
    const dimensions = window.FreeRigidBody.boxDimensions(sim.inertia, 1), scale = 2.65 / Math.max(...dimensions);
    const direction = new window.THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion).toArray();
    return { visible: arrow.visible, actualPoint: arrow.position.toArray(), expectedPoint: sim.forcePoint().map(x => x * scale), actualCenter: frame.position.toArray(), expectedCenter: sim.position().map(x => x * scale), guideCenter: window.__forceScene.getObjectByName('center-guides').position.toArray(), direction, force: sim.force, camera: window.__forceCamera.position.toArray(), pathVisible: path.visible, pathCount: count, pathStart: Array.from(path.geometry.attributes.position.array.slice(0, 3)), pathEnd: Array.from(path.geometry.attributes.position.array.slice((count - 1) * 3, count * 3)) };
  });
  assert.equal(snapshot.visible, true);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(snapshot.actualPoint[i] - snapshot.expectedPoint[i]) < 1e-7, 'arrow starts at the physical application point');
    assert.ok(Math.abs(snapshot.actualCenter[i] - snapshot.expectedCenter[i]) < 1e-7, 'model follows the integrated center of mass');
    assert.ok(Math.abs(snapshot.guideCenter[i] - snapshot.actualCenter[i]) < 1e-7, 'orientation guides follow the body center rather than leaving ghost rings behind');
    assert.ok(Math.abs(snapshot.direction[i] - snapshot.force[i] / Math.hypot(...snapshot.force)) < 1e-7, 'arrow points in the world-frame force direction');
  }
  assert.ok(Math.abs(Math.hypot(...snapshot.camera.map((x, i) => x - snapshot.actualCenter[i])) - 7.5) < 1e-7, 'camera tracks the moving center');
  assert.ok(snapshot.pathVisible && snapshot.pathCount > 10, 'center trajectory contains actual motion samples');
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(snapshot.pathStart[i]) < 1e-7, 'center trajectory starts at the real initial position');
    assert.ok(Math.abs(snapshot.pathEnd[i] - snapshot.actualCenter[i]) < 1e-6, 'center trajectory ends at the integrated center');
  }
  await page.locator('label:has(#show-center-trail)').click(); await twoFrames(page);
  assert.equal(await page.evaluate(() => window.__forceScene.getObjectByName('center-trajectory').visible), false);
  await page.locator('label:has(#show-center-trail)').click(); await twoFrames(page);
  assert.equal(await page.evaluate(() => window.__forceScene.getObjectByName('center-trajectory').visible), true);
  assert.deepEqual(errors, []);
});

test('mobile force controls, compass and playback remain usable in portrait and short landscape', async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page); await watchSimulation(page); await open(page);
  await page.locator('#toggle-controls').tap();
  await page.locator('label:has(#enable-force)').tap();
  assert.equal(await page.locator('#force-controls').isVisible(), true);
  await page.locator('[data-force-direction="ny"]').tap();
  assert.equal(await page.locator('[data-force-direction="ny"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-force-point="center"]').tap();
  await page.evaluate(() => { for (let i = 0; i < 12; i++) document.querySelector('#step').click(); });
  const segmentBeforeAzimuth = await page.evaluate(() => window.__rigidSim.segment.startStep);
  await page.locator('#force-azimuth').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#force-azimuth-value').innerText(), '85°');
  assert.equal(await page.locator('[data-force-direction="ny"]').getAttribute('aria-pressed'), 'true', 'azimuth is irrelevant at the pole');
  assert.equal(await page.evaluate(() => window.__rigidSim.segment.startStep), segmentBeforeAzimuth, 'an unchanged polar force does not reset diagnostics');
  await page.locator('[data-force-direction="pz"]').tap();
  await page.locator('#toggle-controls').tap();
  await page.locator('#toggle-knowledge').tap();
  await page.locator('#flip-segment-caption').scrollIntoViewIfNeeded();
  const captions = await page.evaluate(() => [...document.querySelectorAll('.chart-caption span')].map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
  assert.ok(captions[0].right <= captions[1].left && captions[1].right <= captions[2].left, 'segment caption fits between the mobile chart labels');
  await page.locator('#toggle-knowledge').tap();
  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [800, 500]]) {
    await page.setViewportSize({ width, height }); await twoFrames(page);
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const compass = rect('#world-frame'), hud = rect('.lab-bottom'), legend = rect('.stage-bottom');
      const overlap = (a, b) => Boolean(a.width && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      return { overflow: document.documentElement.scrollWidth - innerWidth, compass: [compass.left, compass.top, compass.right, compass.bottom], overlapsHud: overlap(compass, hud), legendOverlapsHud: overlap(legend, hud) };
    });
    assert.equal(layout.overflow, 0);
    assert.ok(layout.compass[0] >= 0 && layout.compass[1] >= 0 && layout.compass[2] <= width && layout.compass[3] <= height, `compass fits ${width}×${height}`);
    assert.equal(layout.overlapsHud, false); assert.equal(layout.legendOverlapsHud, false);
    await assertVisibleModel(page);
  }
  assert.deepEqual(errors, []);
});

test('context loss during forced motion keeps force, pose and translation in the fallback', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await open(page);
  if (!await hasWebGL(page, t)) return;
  await page.locator('label:has(#enable-force)').click();
  await page.locator('[data-force-point="center"]').click(); await page.locator('[data-force-direction="px"]').click();
  await setRange(page, '#force-magnitude', 3);
  await page.evaluate(() => { for (let i = 0; i < 120; i++) document.querySelector('#step').click(); });
  const before = await page.evaluate(() => ({ force: window.__rigidSim.force, position: window.__rigidSim.position(), velocity: window.__rigidSim.velocity(), q: window.__rigidSim.orientation(), steps: window.__rigidSim.steps }));
  const triggered = await page.locator('#rigid-scene').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false; ext.loseContext(); return true;
  });
  assert.equal(triggered, true);
  await page.waitForFunction(() => document.querySelector('#rigid-stage').dataset.renderer === 'canvas2d');
  const after = await page.evaluate(() => ({ force: window.__rigidSim.force, position: window.__rigidSim.position(), velocity: window.__rigidSim.velocity(), q: window.__rigidSim.orientation(), steps: window.__rigidSim.steps }));
  assert.deepEqual(after, before);
  await assertVisibleModel(page);
  assert.equal(await page.locator('#velocity-legend').isVisible(), true);
  const withVelocity = await imageHash(page);
  await page.locator('label:has(#show-velocity)').click();
  assert.notEqual(await imageHash(page), withVelocity, 'velocity survives the WebGL-to-Canvas transition');
  await page.locator('label:has(#show-velocity)').click();
  assert.equal(await imageHash(page), withVelocity);
  const withTrail = await imageHash(page);
  await page.locator('label:has(#show-center-trail)').click();
  assert.notEqual(await imageHash(page), withTrail, 'the real center trajectory survives the WebGL-to-Canvas transition');
  await page.locator('label:has(#show-center-trail)').click();
  assert.equal(await imageHash(page), withTrail);
  await page.locator('#step').click();
  assert.equal(await page.evaluate(() => window.__rigidSim.steps), before.steps + 4);
  assert.equal(await page.locator('#world-frame').isVisible(), true);
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D fallback']) test(`${mode}: force edits are continuous, presets cover all spatial axes, and coasting retains the trajectory`, async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode !== 'WebGL') await disableWebGL(page);
  await watchSimulation(page); await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  await page.locator('label:has(#enable-force)').click();
  await page.locator('[data-force-point="center"]').click();
  await setRange(page, '#force-magnitude', 2);
  await page.locator('[data-force-direction="px"]').click();
  await page.evaluate(() => { for (let i = 0; i < 120; i++) document.querySelector('#step').click(); });
  const before = await page.evaluate(() => ({ state: Array.from(window.__rigidSim.state), time: window.__rigidSim.time(), position: window.__rigidSim.position(), velocity: window.__rigidSim.velocity() }));
  assert.ok(Math.abs(before.position[0] - 4) < 1e-9 && Math.abs(before.velocity[0] - 4) < 1e-9);
  for (const [direction, vector] of [['nx', [-2, 0, 0]], ['py', [0, 2, 0]], ['ny', [0, -2, 0]], ['pz', [0, 0, 2]], ['nz', [0, 0, -2]], ['px', [2, 0, 0]]]) {
    await page.locator(`[data-force-direction="${direction}"]`).click();
    assert.equal(await page.locator(`[data-force-direction="${direction}"]`).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-force-direction][aria-pressed="true"]').count(), 1);
    const now = await page.evaluate(() => ({ state: Array.from(window.__rigidSim.state), force: window.__rigidSim.force, time: window.__rigidSim.time(), segment: window.__rigidSim.segment.startStep }));
    assert.deepEqual(now.state, before.state, 'preset changes do not teleport or stop the body');
    assert.equal(now.time, before.time);
    assert.equal(now.segment, 480);
    now.force.forEach((value, i) => assert.ok(Math.abs(value - vector[i]) < 1e-12));
  }
  await page.locator('[data-force-direction="py"]').click();
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); });
  const changed = await page.evaluate(() => ({ p: window.__rigidSim.position(), v: window.__rigidSim.velocity(), t: window.__rigidSim.time(), energy: window.__rigidSim.mechanicalEnergyError(), impulse: window.__rigidSim.linearMomentumError() }));
  [8, 1, 0].forEach((value, i) => assert.ok(Math.abs(changed.p[i] - value) < 1e-9));
  [4, 2, 0].forEach((value, i) => assert.ok(Math.abs(changed.v[i] - value) < 1e-9));
  assert.equal(changed.t, 3); assert.ok(Math.abs(changed.energy) < 1e-7 && changed.impulse < 1e-9);
  assert.equal(await page.locator('#center-trail-legend').isVisible(), true);
  const withTrail = await imageHash(page);
  await page.locator('label:has(#show-center-trail)').click();
  assert.notEqual(await imageHash(page), withTrail, 'center trajectory is visibly drawn and can be hidden');
  await page.locator('label:has(#show-center-trail)').click();
  assert.equal(await imageHash(page), withTrail);
  await page.locator('label:has(#enable-force)').click();
  const disabled = await page.evaluate(() => ({ p: window.__rigidSim.position(), v: window.__rigidSim.velocity(), force: window.__rigidSim.force, segmentTime: window.__rigidSim.segmentTime() }));
  assert.deepEqual(disabled.p, changed.p); assert.deepEqual(disabled.v, changed.v); assert.deepEqual(disabled.force, [0, 0, 0]);
  assert.equal(disabled.segmentTime, 0);
  assert.match(await page.locator('#caption-mode').innerText(), /惯性平动/);
  assert.equal(await page.locator('#world-frame').isVisible(), true);
  assert.equal(await page.locator('#force-controls').isVisible(), false);
  assert.equal(await page.locator('#force-monitor').isVisible(), true, 'motion readouts remain available after switching off force');
  assert.equal(await page.locator('#force-velocity').innerText(), '4.47 m/s');
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); });
  const coast = await page.evaluate(() => ({ p: window.__rigidSim.position(), v: window.__rigidSim.velocity(), energy: window.__rigidSim.energyError(), L: window.__rigidSim.momentumError() }));
  coast.p.forEach((value, i) => assert.ok(Math.abs(value - (disabled.p[i] + disabled.v[i])) < 1e-9));
  coast.v.forEach((value, i) => assert.ok(Math.abs(value - disabled.v[i]) < 1e-10));
  assert.ok(Math.abs(coast.energy) < 1e-7 && coast.L < 1e-7);
  assert.equal(await page.locator('#center-trail-legend').isVisible(), true);
  await page.locator('#reset').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  assert.deepEqual(await page.evaluate(() => window.__rigidSim.position()), [0, 0, 0]);
  assert.deepEqual(await page.evaluate(() => window.__rigidSim.velocity()), [0, 0, 0]);
  assert.equal(await page.locator('#center-trail-legend').isVisible(), false);
  assert.equal(await page.locator('#force-monitor').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('adjusting force while playing preserves the state and simulation clock', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page); await watchSimulation(page); await open(page);
  await page.locator('label:has(#enable-force)').click();
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__rigidSim.time() > .35);
  const changed = await page.evaluate(() => {
    const sim = window.__rigidSim, before = Array.from(sim.state), steps = sim.steps;
    document.querySelector('[data-force-direction="nx"]').click();
    return { sameSimulation: window.__rigidSim === sim, before, after: Array.from(sim.state), stepsBefore: steps, stepsAfter: sim.steps, force: sim.force, segmentTime: sim.segmentTime(), energy: sim.mechanicalEnergyError(), impulse: sim.linearMomentumError() };
  });
  assert.equal(changed.sameSimulation, true);
  assert.deepEqual(changed.after, changed.before); assert.equal(changed.stepsAfter, changed.stepsBefore);
  assert.equal(changed.segmentTime, 0); assert.equal(changed.energy, 0); assert.equal(changed.impulse, 0);
  assert.ok(changed.force[0] < -.99);
  await page.waitForFunction(steps => window.__rigidSim.steps > steps + 20, changed.stepsAfter);
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await page.locator('#play').click();
  assert.deepEqual(errors, []);
});

test('force framing eases without changing a paused experiment and respects reduced motion', async t => {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const page = await newPage(t, { reducedMotion });
    await page.route('**/vendor/three.min.js*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + `
      ;{ const Original = window.THREE.WebGLRenderer;
        window.THREE.WebGLRenderer = function (...args) {
          const renderer = new Original(...args), render = renderer.render.bind(renderer);
          renderer.render = function (scene, camera) { window.__framingCamera = camera; return render(scene, camera); };
          return renderer;
        };
      }
    ` }));
    await watchSimulation(page); await open(page);
    if (!await hasWebGL(page, t)) return;
    if (await page.locator('#play-text').innerText() === '暂停') await page.locator('#play').click();
    const values = await page.evaluate(() => {
      const camera = window.__framingCamera, sim = window.__rigidSim, before = camera.fov, physical = Array.from(sim.state), steps = sim.steps;
      document.querySelector('label:has(#enable-force)').click();
      return { before, immediate: camera.fov, physical, afterPhysical: Array.from(sim.state), steps, afterSteps: sim.steps };
    });
    assert.deepEqual(values.afterPhysical, values.physical); assert.equal(values.afterSteps, values.steps);
    if (reducedMotion === 'reduce') {
      assert.ok(values.immediate > values.before + .1, 'reduced motion uses an immediate reframe');
    } else {
      assert.ok(Math.abs(values.immediate - values.before) < 1e-8, 'normal motion does not jump at the moment force is enabled');
      await page.waitForFunction(before => window.__framingCamera.fov > before + .1, values.before);
      await page.waitForTimeout(800);
      const off = await page.evaluate(() => {
        const before = window.__framingCamera.fov;
        document.querySelector('label:has(#enable-force)').click();
        return { before, immediate: window.__framingCamera.fov };
      });
      assert.ok(off.before > values.before + .1);
      assert.ok(Math.abs(off.before - off.immediate) < 1e-8, 'disabling force also avoids a jump');
      await page.waitForFunction(before => Math.abs(window.__framingCamera.fov - before) < .1, values.before);
    }
    await page.close();
  }
});

test('the flip card retains a warning for earlier off-center forcing until the experiment is reset', async t => {
  const page = await newPage(t); await disableWebGL(page); await watchSimulation(page); await open(page);
  await page.locator('label:has(#enable-force)').click();
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); });
  assert.equal(await page.locator('#flip-force-note').isVisible(), true);
  await page.locator('[data-force-point="center"]').click();
  assert.match(await page.locator('#flip-force-note').innerText(), /曾经历偏心受力/);
  await page.locator('label:has(#enable-force)').click();
  assert.equal(await page.locator('#flip-force-note').isVisible(), true);
  assert.match(await page.locator('#flip-force-note').innerText(), /曾经历偏心受力/);
  await page.locator('[data-try-axis="middle"]').click();
  assert.equal(await page.locator('#flip-force-note').isVisible(), false);
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
});

for (const mode of ['WebGL', 'Canvas 2D fallback']) test(`${mode}: velocity and force comparison runs a real two-stage experiment and coasts`, async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode !== 'WebGL') await disableWebGL(page);
  await watchSimulation(page); await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  await page.locator('[data-note="motion"]').click();
  assert.equal(await page.locator('#motion-angle').innerText(), '—', 'angle is undefined without force and velocity');
  assert.equal(await page.locator('#motion-speed').innerText(), '0.00 m/s');
  assert.equal(await page.locator('#motion-acceleration').innerText(), '0.00 m/s²');
  assert.equal(await page.locator('#velocity-legend').isVisible(), false);
  await page.locator('label:has(#enable-force)').click();
  assert.equal(await page.locator('#motion-angle').innerText(), '—', 'angle is undefined when force is nonzero but velocity is zero');
  assert.equal(await page.locator('#motion-acceleration').innerText(), '1.00 m/s²');
  assert.equal(await page.locator('#motion-point').innerText(), '+X 面');
  const torque = await page.evaluate(() => Math.hypot(...window.__rigidSim.worldTorque()).toFixed(2) + ' N·m');
  assert.equal(await page.locator('#motion-torque').innerText(), torque, 'the card uses the actual off-center torque');
  await page.locator('label:has(#show-velocity)').click();
  await page.locator('label:has(#show-center-trail)').click();
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__rigidSim.steps > 12);
  await page.locator('#try-force-turn').click();
  const start = await page.evaluate(() => ({ time: window.__rigidSim.time(), position: window.__rigidSim.position(), velocity: window.__rigidSim.velocity(), force: window.__rigidSim.force, point: window.__rigidSim.point, segment: window.__rigidSim.segment.startStep }));
  assert.equal(start.time, 1); assert.equal(start.segment, 240);
  [.75, 0, 0].forEach((value, i) => assert.ok(Math.abs(start.position[i] - value) < 1e-9));
  [1.5, 0, 0].forEach((value, i) => assert.ok(Math.abs(start.velocity[i] - value) < 1e-9));
  assert.deepEqual(start.force, [0, 1.5, 0]); assert.deepEqual(start.point, [0, 0, 0]);
  assert.equal(await page.locator('#play-text').innerText(), '播放', 'the guided action pauses rather than automatically playing');
  assert.equal(await page.locator('#motion-angle').innerText(), '90.0°');
  assert.equal(await page.locator('#motion-speed').innerText(), '1.50 m/s');
  assert.equal(await page.locator('#motion-acceleration').innerText(), '1.50 m/s²');
  assert.equal(await page.locator('#motion-torque').innerText(), '0.00 N·m');
  assert.equal(await page.locator('#motion-point').innerText(), '质心');
  assert.equal(await page.locator('#show-velocity').isChecked(), true);
  assert.equal(await page.locator('#show-center-trail').isChecked(), true);
  assert.equal(await page.locator('#velocity-legend').isVisible(), true);
  const withTrajectory = await imageHash(page);
  await page.locator('label:has(#show-center-trail)').click();
  assert.notEqual(await imageHash(page), withTrajectory, 'the short first-stage path is visible over the body');
  await page.locator('label:has(#show-center-trail)').click();
  assert.equal(await imageHash(page), withTrajectory);
  await page.locator('[data-force-direction="nx"]').click();
  assert.equal(await page.locator('#motion-angle').innerText(), '180.0°');
  await page.locator('[data-force-direction="py"]').click();
  assert.equal(await page.locator('#motion-angle').innerText(), '90.0°');
  const withVelocity = await imageHash(page);
  await page.locator('label:has(#show-velocity)').click();
  assert.equal(await page.locator('#velocity-legend').isVisible(), false);
  assert.notEqual(await imageHash(page), withVelocity, 'toggling v changes the rendered image');
  await page.locator('label:has(#show-velocity)').click();
  assert.equal(await imageHash(page), withVelocity);
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); });
  const after = await page.evaluate(() => ({ p: window.__rigidSim.position(), v: window.__rigidSim.velocity() }));
  [2.25, .75, 0].forEach((value, i) => assert.ok(Math.abs(after.p[i] - value) < 1e-9));
  [1.5, 1.5, 0].forEach((value, i) => assert.ok(Math.abs(after.v[i] - value) < 1e-9));
  assert.equal(await page.locator('#motion-angle').innerText(), '45.0°');
  assert.equal(await page.locator('#motion-speed').innerText(), '2.12 m/s');
  await page.locator('label:has(#enable-force)').click();
  assert.equal(await page.locator('#motion-angle').innerText(), '—', 'zero force has no direction');
  assert.equal(await page.locator('#motion-acceleration').innerText(), '0.00 m/s²');
  assert.equal(await page.locator('#velocity-legend').isVisible(), true, 'velocity remains visible when coasting');
  const coastWithVelocity = await imageHash(page);
  await page.locator('label:has(#show-velocity)').click();
  assert.notEqual(await imageHash(page), coastWithVelocity, 'the velocity arrow is rendered without force');
  await page.locator('label:has(#show-velocity)').click();
  await page.locator('#reset').click();
  assert.equal(await page.locator('#motion-angle').innerText(), '—');
  assert.equal(await page.locator('#motion-speed').innerText(), '0.00 m/s');
  assert.equal(await page.locator('#velocity-legend').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('WebGL velocity arrow is anchored to the center and follows the world-space velocity with a bounded scale', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + `
    ;{ const Original = window.THREE.WebGLRenderer;
      window.THREE.WebGLRenderer = function (...args) {
        const renderer = new Original(...args), render = renderer.render.bind(renderer);
        renderer.render = function (scene, camera) { window.__velocityScene = scene; return render(scene, camera); };
        return renderer;
      };
    }
  ` }));
  await watchSimulation(page); await open(page);
  if (!await hasWebGL(page, t)) return;
  assert.equal(await page.evaluate(() => window.__velocityScene.getObjectByName('linear-velocity').visible), false);
  await page.locator('[data-note="motion"]').click(); await page.locator('#try-force-turn').click(); await twoFrames(page);
  const snapshot = () => page.evaluate(() => {
    const sim = window.__rigidSim, arrow = window.__velocityScene.getObjectByName('linear-velocity');
    const body = window.__velocityScene.getObjectByName('rigid-frame');
    const direction = new window.THREE.Vector3(0, 1, 0).applyQuaternion(arrow.quaternion).toArray();
    return { visible: arrow.visible, origin: arrow.position.toArray(), center: body.position.toArray(), direction, velocity: sim.velocity(), length: arrow.cone.position.y };
  });
  const start = await snapshot();
  assert.ok(start.visible); assert.deepEqual(start.origin, start.center);
  start.direction.forEach((v, i) => assert.ok(Math.abs(v - [1, 0, 0][i]) < 1e-8));
  assert.ok(Math.abs(start.length - .8) < 1e-8, 'small speeds use the minimum visible length');
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); }); await twoFrames(page);
  const turning = await snapshot(), speed = Math.hypot(...turning.velocity);
  turning.direction.forEach((v, i) => assert.ok(Math.abs(v - turning.velocity[i] / speed) < 1e-8));
  assert.ok(Math.abs(turning.length - speed * .5) < 1e-8);
  assert.deepEqual(turning.origin, turning.center);
  await page.evaluate(() => { for (let i = 0; i < 180; i++) document.querySelector('#step').click(); }); await twoFrames(page);
  assert.ok(Math.abs((await snapshot()).length - 2.2) < 1e-8, 'the displayed length has a high-speed cap');
  await page.locator('label:has(#enable-force)').click(); await twoFrames(page);
  assert.ok((await snapshot()).visible, 'the arrow remains visible during force-free coasting');
  await page.locator('label:has(#show-velocity)').click(); await twoFrames(page);
  assert.equal((await snapshot()).visible, false);
  await page.locator('label:has(#show-velocity)').click(); await twoFrames(page);
  assert.equal((await snapshot()).visible, true);
  await page.evaluate(() => { window.__rigidSim.state.set([1e-10, 0, 0], 10); document.querySelector('#step').click(); }); await twoFrames(page);
  assert.equal((await snapshot()).visible, false, 'the exact tiny-speed cutoff hides the WebGL arrow');
  assert.equal(await page.locator('#velocity-legend').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('Canvas velocity arrow projects the real world-space direction before and after the force turns', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (/^webgl/.test(kind)) return null;
      const context = original.call(this, kind, ...args);
      if (kind === '2d' && this.id === 'rigid-scene' && context && !context.__velocitySpy) {
        context.__velocitySpy = true;
        const begin = context.beginPath.bind(context), move = context.moveTo.bind(context), line = context.lineTo.bind(context), stroke = context.stroke.bind(context);
        let path = [];
        context.beginPath = () => { path = []; return begin(); };
        context.moveTo = (x, y) => { path.push([x, y]); return move(x, y); };
        context.lineTo = (x, y) => { path.push([x, y]); return line(x, y); };
        context.stroke = () => { if (context.strokeStyle === '#e1f0f3') window.__velocityLine = path.slice(); return stroke(); };
      }
      return context;
    };
  });
  await watchSimulation(page); await open(page);
  await page.locator('[data-note="motion"]').click(); await page.locator('#try-force-turn').click(); await twoFrames(page);
  const first = await page.evaluate(() => window.__velocityLine);
  assert.equal(first.length, 2);
  assert.ok(first[1][0] > first[0][0] && first[1][1] > first[0][1], 'the +X vector projects rightward and slightly down from the center');
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); }); await twoFrames(page);
  const turned = await page.evaluate(() => window.__velocityLine);
  assert.ok(turned[1][0] > turned[0][0] && turned[1][1] < turned[0][1], 'after one second of +Y force the vector tilts up while retaining +X');
  await page.locator('label:has(#enable-force)').click();
  await page.evaluate(() => { window.__velocityLine = null; });
  await page.locator('#step').click(); await twoFrames(page);
  assert.ok(await page.evaluate(() => Array.isArray(window.__velocityLine)), 'the Canvas arrow is still drawn during coasting');
  await page.evaluate(() => { window.__rigidSim.state.set([1e-10, 0, 0], 10); window.__velocityLine = null; document.querySelector('#step').click(); }); await twoFrames(page);
  assert.equal(await page.evaluate(() => window.__velocityLine), null, 'the exact tiny-speed cutoff also hides the Canvas arrow');
  assert.equal(await page.locator('#velocity-legend').isVisible(), false);
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D fallback']) test(`${mode}: guided turning fits narrow screens and closes the drawer to reveal the model`, async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode !== 'WebGL') await disableWebGL(page);
  await watchSimulation(page); await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  await page.locator('#toggle-knowledge').tap();
  await page.locator('[data-note="motion"]').tap();
  await page.locator('#try-force-turn').tap();
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  assert.equal(await page.locator('#toggle-knowledge').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => window.__rigidSim.time()), 1);
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.equal(await page.locator('#velocity-legend').isVisible(), true);
  for (const [width, height] of [[320, 568], [390, 844], [568, 320], [800, 500]]) {
    await page.setViewportSize({ width, height });
    // Mobile Chromium can report the new viewport before its visual viewport
    // and the compact-layout transform have caught up with the resize.
    await page.waitForFunction(([w, h]) => {
      const stage = document.querySelector('#rigid-stage').getBoundingClientRect();
      const hud = document.querySelector('.lab-bottom').getBoundingClientRect();
      const tip = document.querySelector('#interaction-tip').getBoundingClientRect();
      return stage.width === w && stage.height === h && hud.bottom <= h && tip.left >= 0 && tip.right <= w;
    }, [width, height]);
    await twoFrames(page);
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const hud = rect('.lab-bottom'), legend = rect('.stage-bottom'), tip = rect('#interaction-tip');
      const compass = rect('#world-frame'), caption = rect('.rigid-caption'), index = rect('.rigid-index');
      const overlap = (a, b) => Boolean(a.width && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
      return { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, hud: [hud.left, hud.right, hud.top, hud.bottom], legend: [legend.left, legend.right], overlap: overlap(hud, legend), tip: [tip.left, tip.right], tipOverlap: [hud, legend, compass, caption, index].some(item => overlap(tip, item)) };
    });
    assert.equal(layout.width, width); assert.equal(layout.height, height);
    assert.ok(layout.hud[0] >= 0 && layout.hud[1] <= width && layout.hud[3] <= height, JSON.stringify(layout));
    assert.ok(!layout.overlap && layout.legend[0] >= 0 && layout.legend[1] <= width, JSON.stringify(layout));
    assert.ok(layout.tip[0] >= 0 && layout.tip[1] <= width && !layout.tipOverlap, JSON.stringify(layout));
    await assertVisibleModel(page);
  }
  await page.locator('#toggle-knowledge').tap();
  await page.locator('#motion-angle').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#motion-angle').innerText(), '90.0°');
  assert.deepEqual(errors, []);
});

test('the force-turning lesson also works from a file with the browser offline', async t => {
  const page = await newPage(t), external = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await watchSimulation(page); await page.context().setOffline(true);
  await page.goto(pathToFileURL(path.join(root, 'rigid-body.html')).href);
  await page.locator('[data-note="motion"]').click(); await page.locator('#try-force-turn').click();
  assert.equal(await page.locator('#motion-angle').innerText(), '90.0°');
  assert.equal(await page.evaluate(() => window.__rigidSim.time()), 1);
  await page.evaluate(() => { for (let i = 0; i < 60; i++) document.querySelector('#step').click(); });
  assert.equal(await page.locator('#motion-angle').innerText(), '45.0°');
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
});

test('the guided mobile action returns keyboard focus to the collapsed knowledge drawer', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page); await open(page);
  await page.locator('#toggle-knowledge').click(); await page.locator('[data-note="motion"]').click();
  await page.locator('#try-force-turn').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-knowledge');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#knowledge-panel').isVisible(), true);
  assert.equal(await page.locator('#motion-angle').innerText(), '90.0°');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-knowledge');
  assert.deepEqual(errors, []);
});

test('playing after the guided force turn continuously bends velocity and updates the live card', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page); await watchSimulation(page); await open(page);
  await page.locator('[data-note="motion"]').click(); await page.locator('#try-force-turn').click();
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__rigidSim.time() >= 1.3, null, { timeout: 30000 });
  await page.locator('#play').click();
  const value = await page.evaluate(() => ({ time: window.__rigidSim.time(), velocity: window.__rigidSim.velocity(), angle: window.__rigidSim.forceVelocityAngle() }));
  assert.ok(value.time >= 1.3 && Math.abs(value.velocity[0] - 1.5) < 1e-9);
  assert.ok(Math.abs(value.velocity[1] - 1.5 * (value.time - 1)) < 1e-9);
  assert.ok(value.angle < 90 && value.angle > 0);
  assert.equal(await page.locator('#motion-angle').innerText(), value.angle.toFixed(1) + '°');
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', 'Canvas 2D fallback']) test(`${mode}: short desktop keeps guided feedback outside the open panels`, async t => {
  const page = await newPage(t, { viewport: { width: 1440, height: 500 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (mode !== 'WebGL') await disableWebGL(page);
  await open(page);
  if (mode === 'WebGL' && !await hasWebGL(page, t)) return;
  await page.locator('[data-note="motion"]').click(); await page.locator('#try-force-turn').click(); await twoFrames(page);
  const layout = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect(), tip = rect('#interaction-tip');
    const overlap = (a, b) => Boolean(a.width && b.width && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    return { left: tip.left, right: tip.right, overlap: ['#control-panel', '#knowledge-panel', '.lab-bottom', '.rigid-caption', '#world-frame'].some(selector => overlap(tip, rect(selector))) };
  });
  assert.ok(layout.left >= 0 && layout.right <= 1440 && !layout.overlap, JSON.stringify(layout));
  await assertVisibleModel(page);
  assert.deepEqual(errors, []);
});
