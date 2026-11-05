'use strict';
// Optional browser smoke tests. Requires playwright-core and a Chromium binary;
// the application itself has no runtime dependencies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
let server, base;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

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
test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

async function newPage(t, options = {}) {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'].concat((process.env.CHROMIUM_FLAGS || '').split(/\s+/).filter(Boolean));
  // Independent browser instances also work with single-process headless builds
  // that exit when their last page is closed.
  let browser;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args });
      break;
    } catch (error) {
      // Retry only this minimal Chromium build's intermittent launch failure.
      if (attempt === 2 || !/signal=SIGSEGV/.test(String(error))) throw error;
    }
  }
  t.after(() => browser.close());
  return browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...options });
}
async function setRange(page, value) {
  await page.locator('#parameter').evaluate((input, next) => {
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value));
}
async function compositeImage(page) {
  // Input updates are coalesced onto animation frames; compose the same
  // layers that the PNG exporter uses rather than inspecting the overlay.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const scene = document.querySelector('#scene');
    const output = document.createElement('canvas');
    output.width = scene.width; output.height = scene.height;
    const c = output.getContext('2d'), background = document.querySelector('#atlas-reference'), orbit = document.querySelector('#atlas-orbit');
    c.drawImage(background, 0, 0, output.width, output.height);
    if (orbit && !orbit.hidden) c.drawImage(orbit, 0, 0, output.width, output.height);
    c.drawImage(scene, 0, 0);
    return output.toDataURL('image/png');
  });
}
async function sceneImage(page) {
  return createHash('sha256').update(await compositeImage(page)).digest('hex');
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

test('reduced motion, stepping, camera, speed and PNG export work', async t => {
  const page = await newPage(t), errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()); });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  assert.equal(await page.locator('#play-label').innerText(), 'Play');
  assert.equal(await page.locator('#elapsed').innerText(), '0.00');
  assert.equal(await page.locator('#step').isEnabled(), true);
  assert.equal(await page.locator('#scene-error').isVisible(), false);
  await page.locator('#step').click();
  assert.equal(await page.locator('#elapsed').innerText(), '0.01');
  await page.locator('[data-speed="4"]').click();
  assert.equal(await page.locator('[data-speed="4"]').getAttribute('aria-pressed'), 'true');

  // Establish a freshly rendered default view before comparing canvas pixels.
  await page.locator('#reset-view').click();
  const initial = await sceneImage(page);
  await page.locator('#scene').focus();
  await page.keyboard.press('ArrowRight');
  const rotated = await sceneImage(page);
  assert.notEqual(rotated, initial, 'keyboard rotation must change the projection');
  await page.locator('#reset-view').click();
  assert.equal(await sceneImage(page), initial, 'camera reset restores the original view');
  const rect = await page.locator('#scene').boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 45, rect.y + rect.height / 2 + 25, { steps: 3 }); await page.mouse.up();
  await page.waitForTimeout(150);
  assert.notEqual(await sceneImage(page), initial, 'pointer drag must change the projection');

  await page.locator('#reset-view').click();
  const expectedExport = await compositeImage(page);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-image').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'chaos-atlas-lorenz.png');
  const png = fs.readFileSync(await download.path());
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal('data:image/png;base64,' + png.toString('base64'), expectedExport, 'PNG contains the background, orbit, and live overlay');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});

test('system, parameter, separation and guided experiments reset the actual model', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await page.locator('[data-distance="0.0000001"]').click();
  assert.equal(await page.locator('#separation').innerText(), '1.0e−7');
  await page.locator('[data-distance="0.001"]').click();
  assert.equal(await page.locator('#separation').innerText(), '1.0e−3');
  await page.locator('#step').click();
  await setRange(page, 15);
  assert.equal(await page.locator('#parameter-value').innerText(), '15.0');
  assert.equal(await page.locator('#elapsed').innerText(), '0.00');
  assert.match(await page.locator('#regime-label').innerText(), /Two locally stable/);

  await page.locator('[data-system="rossler"]').click();
  assert.match(await page.locator('#observation-title').innerText(), /Rössler/);
  assert.equal(await page.locator('#parameter-value').innerText(), '5.7');
  assert.match(await page.locator('#equations').innerText(), /x \+ ay/);
  assert.equal(await page.locator('[data-system="rossler"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#elapsed').innerText(), '0.00');
  assert.equal(await page.locator('#separation').innerText(), '1.0e−3');

  await page.locator('[data-system="thomas"]').click();
  assert.equal(await page.locator('#parameter-value').innerText(), '0.208');
  assert.match(await page.locator('#equations').innerText(), /sin\(y\)/);
  await setRange(page, 0.35);
  assert.equal(await page.locator('#parameter-value').innerText(), '0.350');
  assert.match(await page.locator('#divergence-copy').innerText(), /−1\.050/);

  await page.locator('[data-experiment="settle"]').click();
  assert.equal(await page.locator('[data-system="lorenz"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#parameter-value').innerText(), '15.0');
  assert.equal(await page.locator('#separation').innerText(), '1.0e−5');
  assert.equal(await page.locator('#play-label').innerText(), 'Play', 'a guided experiment respects reduced motion');
  await page.locator('[data-experiment="butterfly"]').click();
  assert.equal(await page.locator('#parameter-value').innerText(), '28.0');
  assert.deepEqual(errors, []);
});

test('running, pause, reset and growth readout are connected to time evolution', async t => {
  const page = await newPage(t, { reducedMotion: 'no-preference' });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  assert.equal(await page.locator('#play-label').innerText(), 'Pause');
  await page.locator('[data-speed="4"]').click();
  await page.waitForFunction(() => Number(document.querySelector('#elapsed').textContent) >= 2.5, null, { timeout: 20000 });
  assert.notEqual(await page.locator('#growth').innerText(), '—');
  assert.notEqual(await page.locator('#separation').innerText(), '1.0e−5');
  await page.locator('#play-toggle').click();
  const stopped = await page.locator('#elapsed').innerText();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#elapsed').innerText(), stopped);
  assert.equal(await page.locator('#step').isEnabled(), true);
  await page.locator('#reset').click();
  assert.equal(await page.locator('#elapsed').innerText(), '0.00');
  assert.equal(await page.locator('#growth').innerText(), '—');
  assert.equal(await page.locator('#play-label').innerText(), 'Play');
});

test('layout fits narrow screens and can be operated on mobile', async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(80);
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
    assert.ok(dimensions.scroll <= dimensions.width, 'horizontal overflow at ' + width + ': ' + JSON.stringify(dimensions));
  }
  await page.setViewportSize({ width: 375, height: 800 });
  // The compact media-query change closes desktop panels asynchronously.
  // Wait for that transition before reopening the mobile drawer.
  await page.waitForFunction(() => matchMedia('(max-width: 1100px), (max-aspect-ratio: 5/4)').matches && document.querySelector('#toggle-controls').getAttribute('aria-expanded') === 'false');
  await setPanel(page, 'controls', true);
  await page.locator('[data-system="thomas"]').tap();
  await setPanel(page, 'knowledge', true);
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.match(await page.locator('#observation-title').innerText(), /Thomas/);
  assert.equal(await page.locator('#scene-error').isVisible(), false);
});

test('file protocol is self-contained, and lack of canvas is explained', async t => {
  const page = await newPage(t), remote = [], errors = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(root, 'attractors.html')).href, { waitUntil: 'load' });
  assert.equal(await page.locator('#parameter-value').innerText(), '28.0');
  await page.locator('[data-system="rossler"]').click();
  assert.equal(await page.locator('#parameter-value').innerText(), '5.7');
  assert.deepEqual(remote, []);
  assert.deepEqual(errors, []);

  const fallback = await newPage(t);
  const fallbackErrors = [];
  fallback.on('pageerror', error => fallbackErrors.push(error.message));
  await fallback.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await fallback.goto(base + 'attractors.html', { waitUntil: 'load' });
  assert.match(await fallback.locator('#scene-error').innerText(), /Canvas 2D is unavailable/);
  await fallback.locator('[data-system="rossler"]').click();
  assert.equal(await fallback.locator('#scene-error').isVisible(), true);
  await fallback.locator('[data-note="equations"]').click();
  assert.match(await fallback.locator('#equations').innerText(), /x \+ ay/);
  assert.deepEqual(fallbackErrors, []);

  const blocked = await newPage(t), blockedErrors = [];
  blocked.on('pageerror', error => blockedErrors.push(error.message));
  await blocked.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => { throw new Error('Canvas blocked'); }; });
  await blocked.goto(base + 'attractors.html', { waitUntil: 'load' });
  assert.match(await blocked.locator('#scene-error').innerText(), /Canvas 2D is unavailable/);
  assert.deepEqual(blockedErrors, []);
});

test('the desktop atlas is a full-viewport workbench with independently collapsible panels', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  const layout = await page.evaluate(() => {
    const r = document.querySelector('#scene-container').getBoundingClientRect();
    return { stage: [r.x, r.y, r.width, r.height], document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
  });
  assert.deepEqual(layout.stage, [0, 0, 1440, 900]);
  assert.deepEqual(layout.document, [1440, 900]);
  assert.equal(await page.locator('#control-panel').isVisible(), true);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), true);
  await setPanel(page, 'controls', false);
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), true);
  await setPanel(page, 'knowledge', false);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  await setPanel(page, 'controls', true);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  await setPanel(page, 'knowledge', true);
  assert.equal(await page.locator('#control-panel').isVisible(), true);
  await page.waitForFunction(() => {
    const chart = document.querySelector('#history'), rect = chart.getBoundingClientRect();
    return rect.width > 100 && Math.abs(chart.viewBox.baseVal.width - rect.width) < 0.1 && !!document.querySelector('#history-line').getAttribute('d');
  });
  assert.equal(await page.locator('#scene-error').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('navigation lists the other experiments, preserves state when dismissed and links to the spatial pendulum', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 } });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await setPanel(page, 'knowledge', true);
  await page.locator('.brand[data-jump="stage"]').click();
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'scene');
  await page.locator('#step').click(); const elapsed = await page.locator('#elapsed').innerText();
  await page.locator('#nav-toggle').click();
  assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(await page.locator('#lab-navigation a').evaluateAll(items => items.map(item => item.getAttribute('href'))), require('./navigation-fixtures.cjs')['attractors.html']);
  assert.equal(await page.locator('#lab-navigation [aria-current="page"]').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#lab-navigation').isVisible(), false);
  assert.equal(await page.locator('#elapsed').innerText(), elapsed);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'nav-toggle');
  await page.locator('#nav-toggle').click();
  await page.locator('#lab-navigation a[href="index.html"]').click();
  assert.match(page.url(), /\/index\.html$/);
});

test('field-note cards remain connected to the simulation and the history chart survives reopening', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await page.locator('#step').click();
  assert.equal(await page.locator('#separation-card').innerText(), await page.locator('#separation').innerText());
  await page.locator('[data-note="equations"]').click();
  assert.equal(await page.locator('[data-note="equations"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-note-content="sensitivity"]').isVisible(), false);
  assert.match(await page.locator('#equations').innerText(), /σ\(y − x\)/);
  await page.locator('[data-system="thomas"]').click();
  assert.match(await page.locator('#equations').innerText(), /sin\(y\)/);
  assert.equal(await page.locator('#active-parameter').innerText(), 'b 0.208');
  await page.locator('[data-note="dissipation"]').click();
  assert.match(await page.locator('#divergence-copy').innerText(), /−0\.624/);
  await page.locator('[data-note="growth"]').click();
  assert.equal(await page.locator('#growth-card').innerText(), await page.locator('#growth').innerText());
  await page.locator('[data-note="sensitivity"]').click();
  assert.match(await page.locator('#observation-title').innerText(), /Thomas/);
  const chartBefore = await page.locator('#history-line').getAttribute('d');
  await setPanel(page, 'knowledge', false);
  await page.evaluate(() => { for (let i = 0; i < 12; i++) document.querySelector('#step').click(); });
  await setPanel(page, 'knowledge', true);
  await page.waitForFunction(previous => {
    const chart = document.querySelector('#history'), r = chart.getBoundingClientRect(), line = document.querySelector('#history-line').getAttribute('d');
    return r.width > 100 && r.height > 0 && Math.abs(chart.viewBox.baseVal.width - r.width) < 0.1 && !!line && line !== previous;
  }, chartBefore);
  await page.locator('[data-note-jump="growth"]').click();
  assert.equal(await page.locator('[data-note-content="growth"]').isVisible(), true);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.note), 'growth');
  assert.deepEqual(errors, []);
});

test('compact drawers, panel scroll hints and the legacy growth link work without document scrolling', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  assert.equal(await page.locator('#knowledge-panel').isVisible(), false);
  await setPanel(page, 'controls', true);
  await page.waitForFunction(() => document.querySelector('#controls-shell').classList.contains('has-more'));
  await page.locator('#control-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await page.waitForFunction(() => !document.querySelector('#controls-shell').classList.contains('has-more'));
  await setPanel(page, 'knowledge', true);
  assert.equal(await page.locator('#control-panel').isVisible(), false);
  await page.waitForFunction(() => document.querySelector('#knowledge-shell').classList.contains('has-more'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollTop), 0);
  await page.goto(base + 'attractors.html#growth-note', { waitUntil: 'load' });
  assert.equal(await page.locator('#knowledge-panel').isVisible(), true);
  assert.equal(await page.locator('[data-note="growth"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-note-content="growth"]').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollTop), 0);
});

test('portrait and short landscape viewports keep the scene and playback controls in bounds', async t => {
  const page = await newPage(t, { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  for (const [width, height] of [[320, 568], [360, 640], [390, 844], [568, 320], [800, 500], [901, 768], [1024, 768], [1200, 900], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(([w, h]) => { const r = document.querySelector('#scene-container').getBoundingClientRect(); return r.width === w && r.height === h; }, [width, height]);
    const layout = await page.evaluate(() => {
      const stage = document.querySelector('#scene-container').getBoundingClientRect();
      const hud = document.querySelector('.lab-bottom').getBoundingClientRect();
      const transport = document.querySelector('.transport').getBoundingClientRect();
      const clipped = [...document.querySelectorAll('.transport button')].filter(button => {
        const r = button.getBoundingClientRect();
        return r.left < transport.left - 1 || r.right > transport.right + 1 || r.top < transport.top - 1 || r.bottom > transport.bottom + 1;
      }).map(button => button.id || button.textContent.trim());
      return { stage: [stage.x, stage.y, stage.width, stage.height], doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], hud: [hud.left, hud.top, hud.right, hud.bottom], clipped };
    });
    assert.deepEqual(layout.stage, [0, 0, width, height]);
    assert.deepEqual(layout.doc, [width, height]);
    assert.ok(layout.hud[0] >= 0 && layout.hud[1] >= 0 && layout.hud[2] <= width && layout.hud[3] <= height, `HUD outside ${width}×${height}`);
    assert.deepEqual(layout.clipped, [], `playback clipped at ${width}×${height}`);
  }
});

test('touch dragging rotates the full-screen phase-space scene', async t => {
  const page = await newPage(t, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#reset-view').tap();
  const original = await sceneImage(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 400 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190 + 45 * i / 8, y: 400 + 35 * i / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  assert.notEqual(await sceneImage(page), original);
  await page.locator('#reset-view').tap();
  assert.equal(await sceneImage(page), original);
});

test('atlas styles and scripts are versioned together for cache-safe refreshes', async t => {
  const page = await newPage(t);
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  const versions = await page.evaluate(() => ['link[href^="pendulum.css"]', 'link[href^="styles.css"]', 'script[src^="model.js"]', 'script[src^="lab-shell.js"]', 'script[src^="atlas-renderer.js"]', 'script[src^="app.js"]', 'script[src^="atlas-notes.js"]'].map(selector => {
    const item = document.querySelector(selector);
    return new URL(item.href || item.src).searchParams.get('v');
  }));
  assert.ok(versions[0] && versions.every(version => version === versions[0]));
});

test('all three systems render visible orbits in the unobscured center of the desktop workbench', async t => {
  const page = await newPage(t), images = [];
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  for (const system of ['lorenz', 'rossler', 'thomas']) {
    await page.locator(`[data-system="${system}"]`).click();
    images.push(await sceneImage(page));
    const count = await page.evaluate(() => {
      const canvas = document.querySelector('#scene'), image = document.createElement('canvas');
      image.width = canvas.width; image.height = canvas.height;
      const context = image.getContext('2d'), background = document.querySelector('#atlas-reference'), orbit = document.querySelector('#atlas-orbit');
      context.drawImage(background, 0, 0, image.width, image.height);
      if (orbit && !orbit.hidden) context.drawImage(orbit, 0, 0, image.width, image.height);
      context.drawImage(canvas, 0, 0);
      const left = Math.ceil(document.querySelector('#control-panel').getBoundingClientRect().right + 10);
      const right = Math.floor(document.querySelector('#knowledge-panel').getBoundingClientRect().left - 10);
      const bottom = Math.floor(document.querySelector('.lab-bottom').getBoundingClientRect().top - 10);
      const pixels = context.getImageData(left, 100, right - left, bottom - 100).data;
      let warm = 0;
      for (let i = 0; i < pixels.length; i += 16) {
        if (pixels[i] > 70 && pixels[i] > pixels[i + 1] + 10 && pixels[i] > pixels[i + 2] + 5) warm++;
      }
      return warm;
    });
    assert.ok(count > 100, `${system} orbit is not visible between the panels (${count} warm pixels)`);
  }
  assert.equal(new Set(images).size, 3, 'each system produces its own trajectory');
});

test('a missing model script leaves an actionable message rather than a blank stage', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/model.js*', route => route.abort());
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  assert.match(await page.locator('#scene-error').innerText(), /model could not be loaded.*Refresh/i);
  assert.equal(await page.locator('#scene-error').isVisible(), true);
  await page.locator('[data-note="growth"]').click();
  assert.equal(await page.locator('[data-note-content="growth"]').isVisible(), true);
  assert.deepEqual(errors, []);
});

test('software fallback uses temporary interaction detail for drag, wheel, keyboard and cancel', async t => {
  const page = await newPage(t, { viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (this.id === 'atlas-orbit' && kind === 'webgl') return null;
      return getContext.call(this, kind, ...args);
    };
    const proto = CanvasRenderingContext2D.prototype;
    const begin = proto.beginPath, line = proto.lineTo, stroke = proto.stroke;
    proto.beginPath = function (...args) { if (this.canvas.id === 'atlas-reference') this.__segmentCount = 0; return begin.apply(this, args); };
    proto.lineTo = function (...args) { if (this.canvas.id === 'atlas-reference') this.__segmentCount++; return line.apply(this, args); };
    proto.stroke = function (...args) {
      if (this.canvas.id === 'atlas-reference' && this.__segmentCount > 200) window.__referenceSegments = this.__segmentCount;
      return stroke.apply(this, args);
    };
  });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#reset-view').click();
  assert.equal(await page.locator('#scene-container').getAttribute('data-renderer'), 'canvas2d');
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 1600 && window.__referenceSegments > 4000);
  const fullSegments = await page.evaluate(() => window.__referenceSegments);
  await page.mouse.move(400, 250); await page.mouse.down(); await page.mouse.move(465, 280);
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 800 && document.querySelector('#scene').width === 800 && window.__referenceSegments < 1500);
  const previewSegments = await page.evaluate(() => window.__referenceSegments);
  assert.ok(previewSegments < fullSegments / 2, `expected fewer preview segments (${previewSegments} vs ${fullSegments})`);
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#atlas-reference').evaluate(c => c.width), 800, 'quality remains reduced for the entire drag');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 1600 && document.querySelector('#scene').width === 1600 && window.__referenceSegments > 4000);

  await page.mouse.move(400, 250); await page.mouse.wheel(0, 110);
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 800);
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 1600);
  await page.locator('#scene').focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 800);
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 1600);

  await page.mouse.move(400, 250); await page.mouse.down(); await page.mouse.move(430, 260);
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 800);
  await page.locator('#scene').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.waitForFunction(() => document.querySelector('#atlas-reference').width === 1600);
  await page.mouse.up();
  assert.deepEqual(errors, []);
});

test('a missing orbit helper leaves an interactive, exportable Canvas 2D fallback', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/atlas-renderer.js*', route => route.abort());
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  assert.equal(await page.locator('#scene-container').getAttribute('data-renderer'), 'canvas2d');
  assert.equal(await page.locator('#scene-error').isVisible(), false);
  await page.locator('#reset-view').click();
  const before = await sceneImage(page);
  await page.locator('#scene').focus(); await page.keyboard.press('ArrowLeft');
  assert.notEqual(await sceneImage(page), before);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-image').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'chaos-atlas-lorenz.png');
  assert.deepEqual(errors, []);
});

async function requireWebGL(page, t) {
  const supported = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
  if (!supported) { t.skip('WebGL unavailable; run this test with an enabled GPU or software WebGL'); return false; }
  assert.equal(await page.locator('#scene-container').getAttribute('data-renderer'), 'webgl', 'a functioning WebGL context should render the atlas');
  return true;
}

async function gpuProjectionAgreement(page) {
  return page.evaluate(() => {
    const s = window.__atlasGpuState, canvas = document.querySelector('#atlas-orbit'), gl = canvas.getContext('webgl');
    const p = s.projection, r = p.rotation, center = s.view.center, points = s.reference.points;
    const count = points.length / 3, pixels = new Uint8Array(7 * 7 * 4);
    let checked = 0, hits = 0;
    for (let sample = 0; sample < 24; sample++) {
      const index = ((53 + sample * 397) % count) * 3;
      const x = points[index] - center[0], y = points[index + 1] - center[1], z = points[index + 2] - center[2];
      const horizontal = r.cy * x - r.sy * y, depth0 = r.sy * x + r.cy * y;
      const vertical = r.cp * z - r.sp * depth0, depth = r.sp * z + r.cp * depth0;
      const perspective = Math.max(0.35, Math.min(2.5, r.distance / (r.distance - depth)));
      const sx = p.centerX + (horizontal * perspective - p.midX) * p.scale;
      const sy = p.centerY - (vertical * perspective - p.midY) * p.scale;
      const px = Math.round(sx * canvas.width / s.width), py = Math.round(canvas.height - sy * canvas.height / s.height);
      if (px < 4 || px >= canvas.width - 4 || py < 4 || py >= canvas.height - 4) continue;
      pixels.fill(0); gl.readPixels(px - 3, py - 3, 7, 7, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      checked++;
      if (pixels.some((value, i) => i % 4 === 3 && value > 0)) hits++;
    }
    return { checked, hits, points: count };
  });
}

test('WebGL projects the numerical orbit correctly without re-uploading it on camera changes', async t => {
  const page = await newPage(t), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const proto = WebGLRenderingContext.prototype, upload = proto.bufferData, draw = proto.drawArrays;
    window.__gpuUploads = 0; window.__gpuLineCounts = [];
    proto.bufferData = function (target, data, usage) {
      if (usage === this.STATIC_DRAW) window.__gpuUploads++;
      return upload.call(this, target, data, usage);
    };
    proto.drawArrays = function (mode, first, count) {
      if (mode === this.LINE_STRIP) window.__gpuLineCounts.push(count);
      return draw.call(this, mode, first, count);
    };
    let api;
    Object.defineProperty(window, 'AtlasOrbitRenderer', {
      configurable: true,
      get() { return api; },
      set(value) {
        const create = value.create;
        value.create = function (...args) {
          const renderer = create(...args);
          if (renderer) {
            const render = renderer.draw;
            renderer.draw = function (reference, projection, view, width, height, ...rest) {
              window.__atlasGpuState = { reference, projection, view, width, height, trailA: rest[1], trailB: rest[2], interacting: rest[3] };
              return render.call(this, reference, projection, view, width, height, ...rest);
            };
          }
          return renderer;
        };
        api = value;
      }
    });
  });
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (!await requireWebGL(page, t)) return;
  await page.locator('#reset-view').click();
  const initial = await sceneImage(page), uploads = await page.evaluate(() => window.__gpuUploads);
  let agreement = await gpuProjectionAgreement(page);
  assert.ok(agreement.checked >= 12 && agreement.hits >= agreement.checked * 0.9, `Lorenz GPU projection disagrees with CPU: ${JSON.stringify(agreement)}`);
  assert.equal(agreement.points, 10001);
  await page.locator('#scene').focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  assert.notEqual(await sceneImage(page), initial);
  assert.equal(await page.evaluate(() => window.__gpuUploads), uploads, 'rotating should reuse the static orbit and grid buffers');
  agreement = await gpuProjectionAgreement(page);
  assert.ok(agreement.checked >= 12 && agreement.hits >= agreement.checked * 0.9, `rotated GPU projection disagrees with CPU: ${JSON.stringify(agreement)}`);
  await page.locator('#reset-view').click();
  assert.equal(await sceneImage(page), initial, 'WebGL camera reset restores the original composite');
  await page.locator('#step').click(); await page.locator('#step').click();
  assert.ok(await page.evaluate(() => window.__atlasGpuState.trailA.count >= 2));
  assert.ok(await page.evaluate(() => window.__gpuLineCounts.some(n => n >= 2 && n < 10000)), 'live trajectories are drawn on the GPU too');
  await page.locator('[data-speed="4"]').click(); await page.locator('#play-toggle').click();
  await page.waitForFunction(() => window.__atlasGpuState.trailA.count >= 500, null, { timeout: 30000 });
  await page.locator('#play-toggle').click();
  const liveCount = await page.evaluate(() => window.__atlasGpuState.trailA.count);
  await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(735, 420);
  await page.waitForFunction(() => window.__atlasGpuState.interacting);
  const previewLines = await page.evaluate(() => window.__gpuLineCounts.slice(-3));
  assert.equal(previewLines[0], 10001, 'the complete reference stays on the GPU during rotation');
  assert.ok(previewLines[1] <= 321 && previewLines[2] <= 321, 'long live paths use a lighter interaction preview');
  await page.mouse.up();
  await page.waitForFunction(count => !window.__atlasGpuState.interacting && window.__gpuLineCounts.slice(-3)[1] === count, liveCount);

  for (const [system, expected] of [['rossler', 16001], ['thomas', 10001]]) {
    const before = await page.evaluate(() => window.__gpuUploads);
    await page.locator(`[data-system="${system}"]`).click();
    assert.ok(await page.evaluate(() => window.__gpuUploads > 0));
    assert.ok(await page.evaluate(n => window.__gpuUploads > n, before), 'changing systems uploads a new orbit');
    agreement = await gpuProjectionAgreement(page);
    assert.equal(agreement.points, expected);
    assert.ok(agreement.checked >= 12 && agreement.hits >= agreement.checked * 0.9, `${system} GPU projection disagrees with CPU: ${JSON.stringify(agreement)}`);
  }
  await setPanel(page, 'knowledge', false);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  agreement = await gpuProjectionAgreement(page);
  assert.ok(agreement.checked >= 12 && agreement.hits >= agreement.checked * 0.9, 'projection remains aligned when panels reframe the scene');
  await page.setViewportSize({ width: 1100, height: 750 });
  await page.waitForFunction(() => window.__atlasGpuState.width === 1100 && document.querySelector('#atlas-orbit').width === 1100);
  agreement = await gpuProjectionAgreement(page);
  assert.ok(agreement.checked >= 12 && agreement.hits >= agreement.checked * 0.9, 'projection remains aligned after a viewport resize');

  const expectedExport = await compositeImage(page), downloadPromise = page.waitForEvent('download');
  await page.locator('#save-image').click();
  const download = await downloadPromise;
  assert.equal('data:image/png;base64,' + fs.readFileSync(await download.path()).toString('base64'), expectedExport, 'WebGL PNG composites every layer');
  const pendingDownload = page.waitForEvent('download');
  await page.evaluate(() => {
    window.__previousReference = window.__atlasGpuState.reference;
    const input = document.querySelector('#parameter'); input.value = '0.25';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#save-image').click();
  });
  await pendingDownload;
  assert.equal(await page.locator('#parameter-value').innerText(), '0.250');
  assert.equal(await page.evaluate(() => window.__previousReference !== window.__atlasGpuState.reference), true, 'export flushes a pending parameter rebuild');
  assert.deepEqual(errors, []);
});

test('WebGL restores full resolution after interaction and falls back after context loss', async t => {
  const page = await newPage(t, { viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + 'attractors.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (!await requireWebGL(page, t)) return;
  await page.locator('#reset-view').click();
  await page.waitForFunction(() => document.querySelector('#atlas-orbit').width === 1600);
  const initial = await sceneImage(page);
  await page.mouse.move(400, 250); await page.mouse.down(); await page.mouse.move(455, 275);
  await page.waitForFunction(() => document.querySelector('#atlas-orbit').width === 800 && document.querySelector('#scene').width === 800);
  assert.notEqual(await sceneImage(page), initial);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#atlas-orbit').width === 1600 && document.querySelector('#scene').width === 1600);
  await page.locator('#play-toggle').click();
  await page.waitForFunction(() => Number(document.querySelector('#elapsed').textContent) > 0.1);
  const beforeLoss = Number(await page.locator('#elapsed').innerText());
  const supportedLoss = await page.evaluate(() => {
    const gl = document.querySelector('#atlas-orbit').getContext('webgl'), ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext(); return true;
  });
  if (!supportedLoss) { t.skip('WEBGL_lose_context is unavailable on this browser'); return; }
  await page.waitForFunction(() => document.querySelector('#scene-container').dataset.renderer === 'canvas2d');
  assert.equal(await page.locator('#atlas-orbit').isHidden(), true);
  assert.equal(await page.locator('#scene-error').isVisible(), false);
  assert.equal(await page.locator('#play-label').innerText(), 'Pause', 'context loss does not stop playback');
  await page.waitForFunction(time => Number(document.querySelector('#elapsed').textContent) > time, beforeLoss);
  await page.locator('#play-toggle').click();
  const fallback = await sceneImage(page);
  await page.locator('#scene').focus(); await page.keyboard.press('ArrowLeft');
  assert.notEqual(await sceneImage(page), fallback, 'fallback still responds to camera controls');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-image').click();
  assert.equal((await downloadPromise).suggestedFilename(), 'chaos-atlas-lorenz.png');
  assert.deepEqual(errors, []);
});

test('WebGL silent empty frames and shader failures switch to Canvas 2D', async t => {
  for (const failure of ['blank', 'shader']) {
    const page = await newPage(t), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const context = original.call(this, type, ...args);
        if (this.id === 'atlas-orbit' && type === 'webgl') window.__gpuContextAvailable = !!context;
        return context;
      };
      if (mode === 'blank') WebGLRenderingContext.prototype.drawArrays = function () {};
      else WebGLRenderingContext.prototype.getShaderParameter = function () { return false; };
    }, failure);
    await page.goto(base + 'attractors.html', { waitUntil: 'load' });
    if (!await page.evaluate(() => window.__gpuContextAvailable)) { t.skip('WebGL unavailable for simulated renderer failures'); return; }
    await page.waitForFunction(() => document.querySelector('#scene-container').dataset.renderer === 'canvas2d');
    assert.equal(await page.locator('#scene-error').isVisible(), false, `${failure} should leave a visible 2D orbit`);
    const image = await sceneImage(page);
    await page.locator('#scene').focus(); await page.keyboard.press('ArrowRight');
    assert.notEqual(await sceneImage(page), image);
    assert.deepEqual(errors, []);
  }
});
