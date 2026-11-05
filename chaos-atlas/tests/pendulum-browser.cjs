'use strict';
// Optional end-to-end tests. Requires playwright-core and Chromium; WebGL
// tests intentionally exercise a genuine context, including software WebGL.
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
let server, base, seedLegacyCache = false;
test.before(async () => {
  server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let name = decodeURIComponent(url.pathname);
    if (name === '/old-lab.html') {
      response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><link rel="stylesheet" href="/pendulum.css"><script defer src="/pendulum.js"></script>'); return;
    }
    if (seedLegacyCache && !url.search && (name === '/pendulum.js' || name === '/pendulum.css')) {
      const js = name.endsWith('.js');
      const body = js ? 'window.__staleEntryLoaded = true; if (document.getElementById("pendulum-scene")) throw new Error("stale script used");' : 'body{background:rgb(255,0,0)!important}';
      response.writeHead(200, { 'Content-Type': js ? 'text/javascript' : 'text/css', 'Cache-Control': 'public, max-age=31536000, immutable' }).end(body); return;
    }
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
      // Some minimal single-process Chromium builds intermittently segfault at
      // launch. Retry only that startup failure, never page or assertion errors.
      if (attempt === 2 || !/signal=SIGSEGV/.test(String(error))) throw error;
    }
  }
  t.after(() => browser.close());
  return browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
}
async function imageHash(page) {
  const image = await page.locator('#pendulum-scene').evaluate(canvas => canvas.toDataURL('image/png'));
  return createHash('sha256').update(image).digest('hex');
}
async function selectedBobPixel(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#pendulum-scene'), tag = document.querySelector('#tag-selected');
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(Number(tag.dataset.centerX) * canvas.width / rect.width);
    const y = Math.floor(Number(tag.dataset.centerY) * canvas.height / rect.height);
    const ctx = canvas.getContext('2d');
    if (ctx) return [...ctx.getImageData(x, y, 1, 1).data];
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), pixel = new Uint8Array(4);
    gl.readPixels(x, canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  });
}
async function assertVisibleBob(page) {
  const pixel = await selectedBobPixel(page);
  assert.ok(pixel[3] > 200 && Math.max(...pixel.slice(0, 3)) > 60, `selected bob is not rendered: ${pixel}`);
}
async function assertInteractiveProjection(page) {
  await page.waitForFunction(() => !document.querySelector('#stage-fallback').hidden);
  assert.match(await page.locator('#stage-fallback').innerText(), /2D 投影/);
  assert.equal(await page.locator('#stage-error').isVisible(), false);
  assert.equal(await page.locator('#pendulum-scene').evaluate(c => Boolean(c.getContext('2d'))), true);
  await assertVisibleBob(page);
  const before = await page.locator('#angle1-value').innerText();
  await dragSelected(page, -45, 40);
  assert.notEqual(await page.locator('#angle1-value').innerText(), before, 'replacement canvas still supports dragging');
  await page.locator('#add-bob').click();
  assert.equal(await page.locator('#ball-select option').count(), 3);
  await page.locator('#step').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.02 s');
  await assertVisibleBob(page);
}
async function setRange(page, id, value) {
  await page.locator(id).evaluate((input, next) => { input.value = String(next); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function selectedPoint(page) {
  await page.locator('#model-stage').scrollIntoViewIfNeeded();
  return page.evaluate(() => {
    const stage = document.querySelector('#model-stage').getBoundingClientRect(), tag = document.querySelector('#tag-selected');
    return { x: stage.x + Number(tag.dataset.centerX), y: stage.y + Number(tag.dataset.centerY) };
  });
}
async function dragSelected(page, dx, dy) {
  const point = await selectedPoint(page);
  await page.mouse.move(point.x, point.y); await page.mouse.down();
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 6 }); await page.mouse.up();
}
async function disableWebGL(page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /^webgl/.test(kind) ? null : original.call(this, kind, ...args);
    };
  });
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

test('real WebGL supports reduced motion, stepping, view controls and PNG export', async t => {
  const page = await newPage(t), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()); });
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), false, 'this test requires WebGL');
  assert.equal(await page.locator('#pendulum-scene').evaluate(c => Boolean(c.getContext('webgl2') || c.getContext('webgl'))), true);
  await assertVisibleBob(page);
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  await page.locator('#step').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.02 s');
  await page.locator('#reset-view').click();
  const initial = await imageHash(page);
  await page.locator('#pendulum-scene').focus(); await page.keyboard.press('ArrowRight');
  assert.notEqual(await imageHash(page), initial);
  await page.locator('#reset-view').click();
  assert.equal(await imageHash(page), initial);
  await page.locator('#pendulum-scene').focus(); await page.keyboard.press('+');
  assert.notEqual(await imageHash(page), initial);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-image').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'chaos-lab-spatial-pendulum.png');
  assert.deepEqual(fs.readFileSync(await download.path()).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
});

test('select, add and remove bobs; each link has independent spherical angles', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#ball-select').inputValue(), '1');
  assert.equal(await page.locator('#angle1-value').innerText(), '65°');
  assert.equal(await page.locator('#angle2-value').innerText(), '55°');
  await page.selectOption('#ball-select', '0');
  assert.equal(await page.locator('#angle1-value').innerText(), '115°');
  assert.equal(await page.locator('#angle2-value').innerText(), '−25°');
  await setRange(page, '#angle1', 180); await setRange(page, '#angle2', -180);
  assert.equal(await page.locator('#angle1-value').innerText(), '180°');
  assert.equal(await page.locator('#angle2-value').innerText(), '−180°');
  await page.selectOption('#ball-select', '1');
  assert.equal(await page.locator('#angle1-value').innerText(), '65°', 'other link stays unchanged');
  assert.equal(await page.locator('#angle2-value').innerText(), '55°');
  await page.locator('#add-bob').click();
  assert.match(await page.locator('#ball-count').innerText(), /共 3 个球体/);
  assert.equal(await page.locator('#ball-select').inputValue(), '2');
  assert.equal(await page.locator('#ball-select option').count(), 3);
  await setRange(page, '#angle1', 90); await setRange(page, '#angle2', 90);
  assert.equal(await page.locator('#angle1-value').innerText(), '90°');
  assert.equal(await page.locator('#angle2-value').innerText(), '90°');
  for (let i = 0; i < 9; i++) await page.locator('#add-bob').click();
  assert.equal(await page.locator('#ball-select option').count(), 12, 'WebGL instances are rebuilt for additional links');
  await page.locator('#focus-bob').click();
  assert.equal(await page.locator('#stage-error').isVisible(), false);
  await page.locator('#remove-bob').click();
  assert.equal(await page.locator('#ball-select option').count(), 11);
  for (let i = 0; i < 10; i++) await page.locator('#remove-bob').click();
  assert.equal(await page.locator('#ball-select option').count(), 1);
  assert.equal(await page.locator('#remove-bob').isDisabled(), true);
  assert.deepEqual(errors, []);
});

test('addition is not capped at a preset count, and a long chain still steps', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page); await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(() => { for (let i = 0; i < 128; i++) document.querySelector('#add-bob').click(); });
  assert.equal(await page.locator('#ball-select option').count(), 130);
  assert.equal(await page.locator('#ball-select').inputValue(), '129');
  assert.match(await page.locator('#ball-count').innerText(), /130 个球体/);
  await page.locator('#step').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.02 s');
  assert.equal(await page.locator('#stage-error').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('dragging selected bobs changes both 3D angles; background drag orbits the camera', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('#step').click();
  const theta = await page.locator('#angle1-value').innerText(), phi = await page.locator('#angle2-value').innerText();
  const point = await selectedPoint(page); await page.mouse.move(point.x, point.y);
  assert.equal(await page.locator('#pendulum-scene').evaluate(c => getComputedStyle(c).cursor), 'pointer');
  await dragSelected(page, -80, 70);
  assert.notEqual(await page.locator('#angle1-value').innerText(), theta);
  assert.notEqual(await page.locator('#angle2-value').innerText(), phi, 'drag changes azimuth as well as tilt');
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  assert.equal(await page.locator('#play-text').innerText(), '播放');
  await page.selectOption('#ball-select', '0');
  const first = await page.locator('#angle1-value').innerText();
  await dragSelected(page, -55, 50);
  assert.notEqual(await page.locator('#angle1-value').innerText(), first);
  await page.locator('#focus-bob').click();
  const focusedAngle = await page.locator('#angle1-value').innerText();
  await dragSelected(page, -40, 35);
  assert.notEqual(await page.locator('#angle1-value').innerText(), focusedAngle, 'focused bobs remain draggable');
  await page.locator('#reset-view').click();
  const initial = await imageHash(page), rect = await page.locator('#pendulum-scene').boundingBox();
  await page.mouse.move(rect.x + 45, rect.y + 60); await page.mouse.down();
  await page.mouse.move(rect.x + 105, rect.y + 90, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(250);
  assert.notEqual(await imageHash(page), initial);
  await page.locator('#reset-view').click();
  assert.equal(await imageHash(page), initial);
  assert.deepEqual(errors, []);
});

test('live motion, parameter controls, energy and knowledge cards remain connected', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference' }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await page.locator('[data-speed="2"]').click();
  await page.waitForFunction(() => parseFloat(document.querySelector('#time-readout').textContent) >= 1, null, { timeout: 25000 });
  assert.ok(parseFloat(await page.locator('#kinetic-readout').innerText()) > 0);
  await page.locator('#add-bob').click();
  assert.equal(await page.locator('#play-text').innerText(), '播放', 'editing a live chain pauses it');
  assert.equal(await page.locator('#time-readout').innerText(), '0.00 s');
  assert.equal(await page.locator('#ball-select option').count(), 3);
  await setRange(page, '#gravity', 15); await setRange(page, '#mass', 2.5);
  assert.equal(await page.locator('#gravity-value').innerText(), '15.0 m/s²');
  assert.equal(await page.locator('#mass-value').innerText(), '2.5');
  await page.locator('[data-delta="1"]').click();
  assert.equal(await page.locator('#distance-readout').innerText(), '0.017 m');
  await page.locator('[data-lesson="energy"]').click();
  assert.equal(await page.locator('#lesson-title').innerText(), '能量，在两种形式间流动');
  assert.match(await page.locator('#insight-chart').getAttribute('aria-label'), /动能与势能/);
  await page.locator('#lesson-action').click();
  assert.equal(await page.locator('[data-preset="gentle"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#lesson-metric').innerText(), '1.17 J');
  await page.locator('[data-lesson="coupling"]').click();
  assert.match(await page.locator('#lesson-copy').innerText(), /三维方向/);
  assert.match(await page.locator('#chart-title').innerText(), /末节状态/);
  await page.locator('#lesson-action').click();
  assert.equal(await page.locator('[data-preset="energetic"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#angle1-value').innerText(), '115°');
  await page.locator('#show-twin').uncheck(); await page.locator('#show-trail').uncheck();
  await page.locator('[data-lesson="sensitivity"]').click(); await page.locator('#lesson-action').click();
  assert.equal(await page.locator('#show-twin').isChecked(), true);
  assert.equal(await page.locator('[data-preset="butterfly"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
});

test('mobile layout fits controls and supports real touch dragging', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 }); await page.waitForTimeout(120);
    const dimensions = await page.evaluate(() => {
      const bounds = document.querySelector('.transport').getBoundingClientRect();
      const clipped = Array.from(document.querySelectorAll('.transport button')).filter(button => {
        const r = button.getBoundingClientRect();
        return r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1;
      }).map(button => button.id || button.textContent.trim());
      return { scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth, clipped };
    });
    assert.ok(dimensions.scroll <= dimensions.width, `horizontal overflow at ${width}: ${JSON.stringify(dimensions)}`);
    assert.deepEqual(dimensions.clipped, [], `toolbar clipped at ${width}`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // The compact media query may match before the shell's change listener has
  // closed the desktop drawers. Wait for that transition before opening one.
  await page.waitForFunction(() => matchMedia('(max-width: 720px)').matches &&
    document.querySelector('#toggle-controls').getAttribute('aria-expanded') === 'false' &&
    document.querySelector('#toggle-knowledge').getAttribute('aria-expanded') === 'false');
  const fullscreen = await page.evaluate(() => {
    const stage = document.querySelector('#model-stage').getBoundingClientRect();
    return { x: stage.x, y: stage.y, width: stage.width, height: stage.height, viewportWidth: innerWidth, viewportHeight: innerHeight, pageHeight: document.documentElement.scrollHeight };
  });
  assert.deepEqual([fullscreen.x, fullscreen.y, fullscreen.width, fullscreen.height], [0, 0, fullscreen.viewportWidth, fullscreen.viewportHeight]);
  assert.equal(fullscreen.pageHeight, fullscreen.viewportHeight, 'the workbench does not scroll like a document');
  await setPanel(page, 'controls', true);
  await page.locator('#add-bob').tap();
  assert.equal(await page.locator('#ball-select option').count(), 3);
  const before = await page.locator('#angle1-value').innerText();
  await setPanel(page, 'controls', false);
  const point = await selectedPoint(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x - 45 * i / 8, y: point.y + 45 * i / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await setPanel(page, 'controls', true);
  assert.notEqual(await page.locator('#angle1-value').innerText(), before);
  assert.equal(await page.locator('#stage-error').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('direct file access stays self-contained', async t => {
  const page = await newPage(t), remote = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), false);
  await page.locator('#add-bob').click();
  assert.equal(await page.locator('#ball-select option').count(), 3);
  assert.deepEqual(remote, []); assert.deepEqual(errors, []);
});

test('no WebGL falls back to an interactive projected spatial chain', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await disableWebGL(page); await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), true);
  assert.equal(await page.locator('#pendulum-scene').evaluate(c => Boolean(c.getContext('2d'))), true);
  const before = await page.locator('#angle1-value').innerText();
  await dragSelected(page, -50, 60);
  assert.notEqual(await page.locator('#angle1-value').innerText(), before);
  await page.locator('#add-bob').click(); await page.locator('#step').click();
  assert.equal(await page.locator('#time-readout').innerText(), '0.02 s');
  assert.deepEqual(errors, []);
});

test('renderer failure after context creation preserves fallback interactions', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + '\n;window.THREE.Scene = class { constructor() { throw new Error("test renderer initialization failure"); } };'
  }));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), true);
  assert.equal(await page.locator('#pendulum-scene').evaluate(c => Boolean(c.getContext('2d'))), true);
  const before = await page.locator('#angle1-value').innerText();
  await dragSelected(page, -50, 60);
  assert.notEqual(await page.locator('#angle1-value').innerText(), before);
  assert.deepEqual(errors, []);
});

test('absence of all canvas contexts is explained after resetting parameters', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto(base, { waitUntil: 'load' });
  assert.match(await page.locator('#stage-error').innerText(), /无法创建画布/);
  await page.locator('#add-bob').click();
  assert.equal(await page.locator('#stage-error').isVisible(), true);
  assert.deepEqual(errors, []);
});

test('versioned assets do not mix a new page with stale cached scripts or styles', async t => {
  const page = await newPage(t), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  try {
    seedLegacyCache = true;
    await page.goto(base + 'old-lab.html', { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => window.__staleEntryLoaded), true, 'old script was cached');
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 0, 0)');
    seedLegacyCache = false;
    await page.goto(base, { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => window.__staleEntryLoaded), undefined);
    assert.notEqual(await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 0, 0)');
    assert.ok(requests.some(url => /\/pendulum\.js\?v=/.test(url)));
    assert.ok(requests.some(url => /\/pendulum\.css\?v=/.test(url)));
    assert.ok(requests.some(url => /\/spatial-model\.js\?v=/.test(url)));
    const versions = await page.evaluate(() => ['link[href^="pendulum.css"]', 'script[src^="spatial-model.js"]', 'script[src^="lab-shell.js"]', 'script[src^="pendulum.js"]'].map(selector => {
      const element = document.querySelector(selector);
      return new URL(element.href || element.src).searchParams.get('v');
    }));
    assert.ok(versions[0] && versions.every(version => version === versions[0]), 'application asset versions must be bumped together');
    assert.equal(await page.locator('#stage-error').isVisible(), false);
    await assertVisibleBob(page);
    assert.deepEqual(errors, []);
  } finally { seedLegacyCache = false; }
});

test('WebGL1 without instancing falls back to a visible, interactive projection', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (this.id === 'pendulum-scene' && kind === 'webgl2') return null;
      if (this.id === 'pendulum-scene' && kind === 'webgl') {
        const real = original.call(this, kind, ...args); // bind the canvas, as a real WebGL1 context does
        return real ? { getExtension: () => null } : null;
      }
      return original.call(this, kind, ...args);
    };
  });
  await page.goto(base, { waitUntil: 'load' });
  await assertInteractiveProjection(page);
  assert.deepEqual(errors, []);
});

test('a real WebGL context loss replaces the canvas and preserves interactions', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), false, 'this test requires WebGL');
  await assertVisibleBob(page);
  const triggered = await page.locator('#pendulum-scene').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext(); return true;
  });
  assert.equal(triggered, true, 'browser must expose WEBGL_lose_context for this test');
  await assertInteractiveProjection(page);
  assert.deepEqual(errors, []);
});

test('an exception during WebGL rendering falls back without losing the experiment', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + `
      ;{ const Original = window.THREE.WebGLRenderer;
        window.THREE.WebGLRenderer = function (...args) {
          const renderer = new Original(...args), render = renderer.render.bind(renderer);
          renderer.render = function (...values) {
            if (window.__failNextRender) { window.__failNextRender = false; throw new Error('test render failure'); }
            return render(...values);
          };
          return renderer;
        };
      }
    `
  }));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), false, 'this test requires WebGL');
  await assertVisibleBob(page);
  await page.evaluate(() => { window.__failNextRender = true; });
  await page.locator('#reset-view').click();
  await assertInteractiveProjection(page);
  assert.deepEqual(errors, []);
});

test('a missing model script reports an actionable error instead of a blank stage', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/spatial-model.js*', route => route.fulfill({ contentType: 'text/javascript', body: '/* simulate a failed model load */' }));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-error').isVisible(), true);
  assert.match(await page.locator('#stage-error').innerText(), /模型加载失败.*刷新/);
  assert.deepEqual(errors, []);
});

test('supported WebGL1 with ANGLE instancing still renders the 3D model', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return kind === 'webgl2' ? null : original.call(this, kind, ...args);
    };
  });
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), false);
  assert.equal(await page.locator('#pendulum-scene').evaluate(c => Boolean(c.getContext('webgl').getExtension('ANGLE_instanced_arrays'))), true);
  await assertVisibleBob(page);
  assert.deepEqual(errors, []);
});

test('a WebGL context that silently draws nothing triggers a visible projection', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + `
      ;{ const Original = window.THREE.WebGLRenderer;
        window.THREE.WebGLRenderer = function (...args) {
          const renderer = new Original(...args), render = renderer.render.bind(renderer);
          renderer.render = function (...values) {
            render(...values);
            const gl = renderer.getContext();
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
          };
          return renderer;
        };
      }
    `
  }));
  await page.goto(base, { waitUntil: 'load' });
  await assertInteractiveProjection(page);
  assert.deepEqual(errors, []);
});

test('a non-runnable shader program triggers a visible projection', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + `
      ;{ const Original = window.THREE.WebGLRenderer;
        window.THREE.WebGLRenderer = function (...args) {
          const renderer = new Original(...args), render = renderer.render.bind(renderer);
          renderer.render = function (...values) {
            render(...values);
            if (window.__failShader && renderer.info.programs.length) renderer.info.programs[0].diagnostics = { runnable: false };
          };
          return renderer;
        };
      }
    `
  }));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), false);
  await assertVisibleBob(page);
  await page.evaluate(() => { window.__failShader = true; });
  await page.locator('#reset-view').click();
  await assertInteractiveProjection(page);
  assert.deepEqual(errors, []);
});

test('a missing entry script leaves a refresh instruction instead of a blank model', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/pendulum.js*', route => route.fulfill({ contentType: 'text/javascript', body: '/* simulate a failed entry script load */' }));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-error').isVisible(), true);
  assert.match(await page.locator('#stage-error').innerText(), /加载.*刷新/);
  assert.deepEqual(errors, []);
});

test('context loss during playback preserves simulation time and keeps it running', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference' }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => parseFloat(document.querySelector('#time-readout').textContent) >= 0.2, null, { timeout: 25000 });
  const before = parseFloat(await page.locator('#time-readout').innerText());
  assert.equal(await page.locator('#stage-fallback').isVisible(), false);
  const triggered = await page.locator('#pendulum-scene').evaluate(canvas => {
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext(); return true;
  });
  assert.equal(triggered, true);
  await page.waitForFunction(() => !document.querySelector('#stage-fallback').hidden);
  await page.waitForFunction(time => parseFloat(document.querySelector('#time-readout').textContent) >= time + 0.15, before, { timeout: 25000 });
  assert.equal(await page.locator('#play-text').innerText(), '暂停');
  await assertVisibleBob(page);
  assert.deepEqual(errors, []);
});

for (const mode of ['WebGL', '2D fallback']) {
  test(`focus can be cancelled and restores the previous view in ${mode}`, async t => {
    const page = await newPage(t), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (mode === '2D fallback') await disableWebGL(page);
    await page.goto(base, { waitUntil: 'load' });
    const focus = page.locator('#focus-bob');
    assert.equal(await focus.getAttribute('aria-pressed'), 'false');
    assert.equal(await focus.innerText(), '聚焦');
    await page.locator('#pendulum-scene').focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('+');
    const before = await imageHash(page);
    const time = await page.locator('#time-readout').innerText();
    await focus.click();
    assert.equal(await focus.getAttribute('aria-pressed'), 'true');
    assert.equal(await focus.innerText(), '取消聚焦');
    assert.notEqual(await imageHash(page), before, 'focused view should zoom and follow the selected bob');
    await focus.click();
    assert.equal(await focus.getAttribute('aria-pressed'), 'false');
    assert.equal(await focus.innerText(), '聚焦');
    assert.equal(await imageHash(page), before, 'cancel restores the orbit and zoom that preceded focus');
    assert.equal(await page.locator('#time-readout').innerText(), time, 'focus only changes the view');
    await focus.click();
    await page.keyboard.press('Escape');
    assert.equal(await focus.getAttribute('aria-pressed'), 'false', 'Escape exits focus');
    assert.equal(await imageHash(page), before);
    await focus.click();
    await page.locator('#reset-view').click();
    assert.equal(await focus.getAttribute('aria-pressed'), 'false', 'reset view also clears focus state');
    assert.equal(await focus.innerText(), '聚焦');
    assert.deepEqual(errors, []);
  });
}

test('comparison is optional and its WebGL bobs and trails use the real shared coordinates', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/vendor/three.min.js*', route => route.fulfill({
    contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'vendor/three.min.js'), 'utf8') + `
      ;{ const Original = window.THREE.WebGLRenderer;
        window.THREE.WebGLRenderer = function (...args) {
          const renderer = new Original(...args), render = renderer.render.bind(renderer);
          renderer.render = function (scene, camera) {
            const matrix = new window.THREE.Matrix4();
            const meshes = scene.children.filter(object => object.isInstancedMesh && object.geometry.type === 'SphereGeometry');
            const trails = scene.children.filter(object => object.isLine && object.userData.baseColor);
            if (meshes.length === 2 && trails.length === 2) {
              window.__coordinateSnapshot = {
                bobs: meshes.map(mesh => Array.from({length: mesh.count}, (_, index) => {
                  mesh.getMatrixAt(index, matrix); return matrix.elements.slice(12, 15);
                })),
                bobVisible: meshes.map(mesh => mesh.visible),
                trails: trails.map(line => {
                  const n = line.geometry.drawRange.count, values = line.geometry.attributes.position.array;
                  return Array.from({length: n}, (_, i) => Array.from(values.slice(i * 3, i * 3 + 3)));
                }),
                trailVisible: trails.map(line => line.visible)
              };
            }
            return render(scene, camera);
          };
          return renderer;
        };
      }
    `
  }));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), false, 'this test requires WebGL');
  assert.equal(await page.locator('#show-twin').isChecked(), false, 'comparison is hidden by default');
  assert.equal(await page.locator('#legend-twin-item').isVisible(), false);
  const initialTime = await page.locator('#time-readout').innerText();
  const initialDistance = await page.locator('#distance-readout').innerText();
  let snapshot = await page.evaluate(() => window.__coordinateSnapshot);
  assert.deepEqual(snapshot.bobVisible, [true, false]);
  assert.deepEqual(snapshot.trailVisible, [true, false]);

  await page.locator('#show-twin').check();
  assert.equal(await page.locator('#legend-twin-item').isVisible(), true);
  assert.equal(await page.locator('#time-readout').innerText(), initialTime);
  assert.equal(await page.locator('#distance-readout').innerText(), initialDistance, 'the display toggle does not change the physics');

  async function assertRealSeparation(steps) {
    const sample = await page.evaluate(steps => {
      const M = window.SpatialPendulum, sim = new M.Experiment(M.DEFAULTS);
      for (let i = 0; i < steps; i++) sim.step();
      return { expectedA: Array.from(M.positions(sim.a, sim.params)), expectedB: Array.from(M.positions(sim.b, sim.params)), actual: window.__coordinateSnapshot };
    }, steps);
    const { expectedA, expectedB, actual } = sample;
    assert.deepEqual(actual.bobVisible, [true, true]);
    assert.deepEqual(actual.trailVisible, [true, true]);
    for (let i = 0; i < actual.bobs[0].length; i++) for (let axis = 0; axis < 3; axis++) {
      const difference = actual.bobs[1][i][axis] - actual.bobs[0][i][axis];
      const expected = expectedB[i * 3 + axis] - expectedA[i * 3 + axis];
      assert.ok(Math.abs(difference - expected) < 1e-6, `link ${i}, axis ${axis}: actual ${difference}, expected ${expected}`);
    }
    const last = actual.bobs[0].length - 1;
    for (let chain = 0; chain < 2; chain++) for (let axis = 0; axis < 3; axis++) {
      const trailTip = actual.trails[chain].at(-1)[axis], bobTip = actual.bobs[chain][last][axis];
      assert.ok(Math.abs(trailTip - bobTip) < 1e-6, `chain ${chain} trail and bob must share coordinates`);
    }
  }
  await assertRealSeparation(0);
  await page.locator('#step').click();
  await assertRealSeparation(4);
  await page.locator('#show-twin').uncheck();
  assert.equal(await page.locator('#legend-twin-item').isVisible(), false);
  snapshot = await page.evaluate(() => window.__coordinateSnapshot);
  assert.deepEqual(snapshot.bobVisible, [true, false]);
  await page.locator('#lesson-action').click();
  assert.equal(await page.locator('#show-twin').isChecked(), true, 'the comparison experiment can turn it back on');
  assert.equal(await page.locator('#legend-twin-item').isVisible(), true);
  for (let i = 0; i < 10; i++) await page.locator('#add-bob').click();
  const longChain = await page.evaluate(() => {
    const M = window.SpatialPendulum, config = M.normalize(M.DEFAULTS);
    while (config.links.length < 12) config.links.push({ ...config.links[config.links.length - 1] });
    const sim = new M.Experiment(config);
    return { a: Array.from(M.positions(sim.a, sim.params)), b: Array.from(M.positions(sim.b, sim.params)), actual: window.__coordinateSnapshot.bobs };
  });
  assert.equal(longChain.actual[0].length, 12);
  for (let i = 0; i < 12; i++) for (let axis = 0; axis < 3; axis++) {
    const difference = longChain.actual[1][i][axis] - longChain.actual[0][i][axis];
    const expected = (longChain.b[i * 3 + axis] - longChain.a[i * 3 + axis]) * (2 / 12);
    assert.ok(Math.abs(difference - expected) < 1e-6, `scaled chain ${i}, axis ${axis}: actual ${difference}, expected ${expected}`);
  }
  assert.deepEqual(errors, []);
});

test('2D fallback projects the two initial chains from the same pivot and coordinates', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (/^webgl/.test(kind)) return null;
      const ctx = getContext.call(this, kind, ...args);
      if (this.id === 'pendulum-scene' && kind === '2d' && ctx && !ctx.__observed) {
        ctx.__observed = true;
        const arc = ctx.arc.bind(ctx), fill = ctx.fill.bind(ctx);
        ctx.arc = function (x, y, radius, ...rest) { this.__lastCircle = [x, y, radius]; return arc(x, y, radius, ...rest); };
        ctx.fill = function (...values) {
          if (this.__lastCircle && (this.fillStyle === '#efbd84' || this.fillStyle === '#8fe1cf')) {
            const target = this.fillStyle === '#efbd84' ? 'a' : 'b';
            (window.__fallbackBobs ||= { a: [], b: [] })[target].push(this.__lastCircle.slice());
          }
          return fill(...values);
        };
      }
      return ctx;
    };
  });
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), true);
  await page.locator('#show-twin').check();
  const bobs = await page.evaluate(() => ({ a: window.__fallbackBobs.a.slice(-2), b: window.__fallbackBobs.b.slice(-2) }));
  assert.equal(bobs.a.length, 2); assert.equal(bobs.b.length, 2);
  const firstGap = Math.hypot(bobs.a[0][0] - bobs.b[0][0], bobs.a[0][1] - bobs.b[0][1]);
  const endGap = Math.hypot(bobs.a[1][0] - bobs.b[1][0], bobs.a[1][1] - bobs.b[1][1]);
  assert.ok(firstGap < 1e-8, `unperturbed first bobs must overlap; projected gap=${firstGap}`);
  assert.ok(endGap < 1, `the tiny 0.1° perturbation should initially appear nearly coincident; gap=${endGap}`);
  assert.deepEqual(errors, []);
});

test('focus toggle remains clear and fits the control row on narrow screens', async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  let wasCompact = await page.evaluate(() => matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)').matches);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const compact = width <= 1100 || width / 844 <= 5 / 4, crossed = compact !== wasCompact;
    // The media-query change listener can run after innerWidth changes. Wait
    // for the shell's breakpoint reset before opening the drawer ourselves.
    await page.waitForFunction(({width, compact, crossed}) => {
      if (innerWidth !== width || Math.abs(document.querySelector('#model-stage').getBoundingClientRect().width - width) > 1 ||
        matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)').matches !== compact) return false;
      return !crossed || ['#toggle-controls', '#toggle-knowledge'].every(selector => document.querySelector(selector).getAttribute('aria-expanded') === String(!compact));
    }, {width, compact, crossed});
    wasCompact = compact;
    await setPanel(page, 'controls', true);
    await page.locator('#focus-bob').tap();
    if (await page.evaluate(() => matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)').matches)) {
      assert.equal(await page.locator('#toggle-controls').getAttribute('aria-expanded'), 'false', 'compact focus reveals the model');
      assert.equal(await page.locator('#exit-focus').isVisible(), true);
      await setPanel(page, 'controls', true);
    }
    assert.equal(await page.locator('#focus-bob').innerText(), '取消聚焦');
    const bounds = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; };
      return { row: rect('.ball-select-row > div'), select: rect('#ball-select'), focus: rect('#focus-bob'), text: rect('#focus-bob span'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.equal(bounds.overflow, 0, `horizontal overflow at ${width}`);
    assert.ok(bounds.select.width > 70 && bounds.select.left >= bounds.row.left - 1 && bounds.select.right <= bounds.focus.left + 1, `select or focus overlaps at ${width}: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.focus.right <= bounds.row.right + 1 && bounds.text.right <= bounds.focus.right - 2, `cancel label clipped at ${width}: ${JSON.stringify(bounds)}`);
    await page.locator('#focus-bob').tap();
    assert.equal(await page.locator('#focus-bob').getAttribute('aria-pressed'), 'false');
  }
  assert.deepEqual(errors, []);
});

test('immersive desktop workbench keeps the stage full-screen and both panels independently collapsible', async t => {
  const page = await newPage(t, { viewport: { width: 1440, height: 900 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  const dimensions = await page.evaluate(() => {
    const stage = document.querySelector('#model-stage').getBoundingClientRect();
    return { x: stage.x, y: stage.y, width: stage.width, height: stage.height, pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, w: innerWidth, h: innerHeight };
  });
  assert.deepEqual([dimensions.x, dimensions.y, dimensions.width, dimensions.height], [0, 0, dimensions.w, dimensions.h]);
  assert.deepEqual([dimensions.pageWidth, dimensions.pageHeight], [dimensions.w, dimensions.h]);
  assert.equal(await page.locator('#toggle-controls').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#toggle-knowledge').getAttribute('aria-expanded'), 'true');
  await assertVisibleBob(page);
  await setRange(page, '#gravity', 12.5);
  await page.locator('#step').click();
  const time = await page.locator('#time-readout').innerText();
  await setPanel(page, 'controls', false);
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.equal(await page.locator('#toggle-controls').innerText(), '控制台');
  assert.equal(await page.locator('#knowledge-panel').isVisible(), true, 'the other panel is independent on desktop');
  await setPanel(page, 'knowledge', false);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  assert.equal(await page.locator('#toggle-knowledge').innerText(), '知识卡片');
  assert.equal(await page.locator('#time-readout').innerText(), time, 'folding panels does not reset the experiment');
  await assertVisibleBob(page);
  await setPanel(page, 'controls', true);
  assert.equal(await page.locator('#gravity-value').innerText(), '12.5 m/s²');
  await setPanel(page, 'knowledge', true);
  await page.locator('[data-lesson="energy"]').click();
  assert.equal(await page.locator('#lesson-title').innerText(), '能量，在两种形式间流动');
  assert.deepEqual(errors, []);
});

test('top pull-down contains the other page links and preserves the current experiment when dismissed', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  await setPanel(page, 'controls', false); await setPanel(page, 'knowledge', false);
  await page.locator('#step').click();
  const time = await page.locator('#time-readout').innerText();
  assert.equal(await page.locator('#lab-navigation').isVisible(), false);
  await page.locator('#nav-toggle').click();
  assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'), 'true');
  const links = page.locator('#lab-navigation a');
  assert.deepEqual(await links.evaluateAll(items => items.map(item => item.getAttribute('href'))), require('./navigation-fixtures.cjs')['index.html']);
  assert.equal(await page.locator('#lab-navigation [aria-current="page"]').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#lab-navigation').isVisible(), false);
  assert.equal(await page.locator('#time-readout').innerText(), time, 'closing navigation does not reset the simulation');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'nav-toggle');
  await page.locator('#nav-toggle').click();
  await page.locator('#lab-navigation a[href="attractors.html"]').click();
  assert.match(page.url(), /\/attractors\.html$/);
  assert.ok(await page.locator('#scene').count(), 'companion atlas is a real working link');
  assert.deepEqual(errors, []);
});

test('small-screen drawers are mutually exclusive and reopening the knowledge chart sizes it correctly', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#toggle-controls').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#toggle-knowledge').getAttribute('aria-expanded'), 'false');
  await assertVisibleBob(page);
  await page.locator('#toggle-controls').tap();
  assert.equal(await page.locator('#control-panel').isVisible(), true);
  await page.waitForFunction(() => document.querySelector('#controls-shell').classList.contains('has-more'));
  await page.locator('#control-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('#controls-shell').classList.contains('has-more'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollTop), 0, 'only the panel scrolls');
  await page.locator('#toggle-knowledge').tap();
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), true);
  await page.waitForFunction(() => {
    const c = document.querySelector('#insight-chart'), r = c.getBoundingClientRect();
    return r.width > 0 && c.width >= Math.round(r.width) && c.height >= Math.round(r.height);
  });
  await page.locator('[data-lesson="coupling"]').tap();
  assert.match(await page.locator('#lesson-title').innerText(), /牵动/);
  await page.locator('#toggle-knowledge').tap();
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  await page.locator('#toggle-controls').tap();
  await page.locator('#focus-bob').tap();
  assert.equal(await page.locator('#control-panel').isVisible(), false, 'focusing reveals the model on a phone');
  assert.equal(await page.locator('#exit-focus').isVisible(), true);
  await page.locator('#exit-focus').tap();
  assert.equal(await page.locator('#exit-focus').isVisible(), false, 'focus can be cancelled without opening a drawer');
  assert.equal(await page.locator('#focus-bob').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, []);
});

test('full-viewport stage and playback controls fit portrait and short landscape viewports', async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'load' });
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [568, 320], [800, 500], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(([w, h]) => {
      const r = document.querySelector('#model-stage').getBoundingClientRect();
      return r.width === w && r.height === h;
    }, [width, height]);
    const result = await page.evaluate(() => {
      const stage = document.querySelector('#model-stage').getBoundingClientRect();
      const toolbar = document.querySelector('.transport').getBoundingClientRect();
      const hud = document.querySelector('.lab-bottom').getBoundingClientRect();
      const clipped = [...document.querySelectorAll('.transport button')].filter(button => {
        const r = button.getBoundingClientRect();
        return r.left < toolbar.left - 1 || r.right > toolbar.right + 1 || r.top < toolbar.top - 1 || r.bottom > toolbar.bottom + 1;
      }).map(button => button.id || button.textContent.trim());
      return { stage: [stage.x, stage.y, stage.width, stage.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], hud: [hud.left, hud.top, hud.right, hud.bottom], clipped };
    });
    assert.deepEqual(result.stage, [0, 0, width, height], `stage must fill ${width}×${height}`);
    assert.deepEqual(result.scroll, [width, height], `document overflow at ${width}×${height}`);
    assert.ok(result.hud[0] >= 0 && result.hud[1] >= 0 && result.hud[2] <= width && result.hud[3] <= height, `HUD outside ${width}×${height}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.clipped, [], `playback controls clipped at ${width}×${height}`);
  }
  assert.deepEqual(errors, []);
});

test('keyboard focus follows mobile drawer and returns to the model when focus ends', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 } });
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('#toggle-controls').focus();
  await page.keyboard.press('Enter');
  await page.locator('#focus-bob').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement.id === 'exit-focus');
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#exit-focus').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'pendulum-scene');
  await page.locator('#toggle-controls').click();
  await page.locator('#angle1').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'toggle-controls');
});

test('rapid panel toggles and viewport breakpoint changes leave a stable layout', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference', viewport: { width: 1440, height: 900 } });
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('#toggle-controls').evaluate(button => { for (let i = 0; i < 6; i++) button.click(); });
  await page.waitForFunction(() => document.querySelector('#control-panel').getBoundingClientRect().width > 100);
  assert.equal(await page.locator('#toggle-controls').getAttribute('aria-expanded'), 'true');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('#toggle-controls').getAttribute('aria-expanded') === 'false' && document.querySelector('#toggle-knowledge').getAttribute('aria-expanded') === 'false');
  await setPanel(page, 'knowledge', true);
  await setPanel(page, 'controls', true);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  await page.setViewportSize({ width: 1200, height: 768 });
  await page.waitForFunction(() => document.querySelector('#toggle-controls').getAttribute('aria-expanded') === 'true' && document.querySelector('#toggle-knowledge').getAttribute('aria-expanded') === 'true');
  await page.waitForFunction(() => document.querySelector('#control-panel').getBoundingClientRect().width > 100 && document.querySelector('#knowledge-panel').getBoundingClientRect().width > 100);
});

test('mobile focus exit remains tappable with the 2D fallback notice visible', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await disableWebGL(page);
  await page.goto(base, { waitUntil: 'load' });
  assert.equal(await page.locator('#stage-fallback').isVisible(), true);
  await page.locator('#toggle-controls').tap();
  await page.locator('#focus-bob').tap();
  const exit = page.locator('#exit-focus');
  await exit.waitFor({ state: 'visible' });
  // Chromium can update the sibling-selector layout after the hidden flag.
  await page.waitForFunction(() => {
    const exit = document.querySelector('#exit-focus').getBoundingClientRect(), notice = document.querySelector('#stage-fallback').getBoundingClientRect();
    return exit.bottom <= notice.top || notice.bottom <= exit.top;
  }, null, { timeout: 5000 });
  const bounds = await Promise.all([exit.boundingBox(), page.locator('#stage-fallback').boundingBox()]);
  assert.ok(bounds[0].y + bounds[0].height <= bounds[1].y || bounds[1].y + bounds[1].height <= bounds[0].y, 'focus exit and fallback notice must not overlap');
  await exit.tap({ timeout: 3000 });
  assert.equal(await exit.isVisible(), false);
  assert.equal(await page.locator('#focus-bob').getAttribute('aria-pressed'), 'false');
});

for (const mode of ['WebGL', '2D fallback']) test(`default selected bob stays visible and draggable across tablet-sized viewports in ${mode}`, async t => {
  const page = await newPage(t, { viewport: { width: 901, height: 768 } });
  if (mode === '2D fallback') await disableWebGL(page);
  for (const [width, height] of [[901, 768], [1024, 768], [1101, 850], [1200, 900], [1200, 1100], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto(base, { waitUntil: 'load' });
    const hit = await page.evaluate(() => {
      const tag = document.querySelector('#tag-selected');
      const x = Number(tag.dataset.centerX), y = Number(tag.dataset.centerY);
      const target = document.elementFromPoint(x, y);
      return { x, y, target: target && target.id, compact: matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)').matches, controls: !document.querySelector('#control-panel').hidden, knowledge: !document.querySelector('#knowledge-panel').hidden };
    });
    assert.equal(hit.target, 'pendulum-scene', `selected bob obscured at ${width}×${height}: ${JSON.stringify(hit)}`);
    assert.equal(hit.controls, !hit.compact);
    assert.equal(hit.knowledge, !hit.compact);
  }
});
