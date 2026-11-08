/* Optional browser regression for the creative Living Canvas. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const G = require('../garden-model.js');
const root = path.resolve(__dirname, '..');
const width = Number(process.argv[2] || 1440), mobile = width <= 520;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => error ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(content));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`; let browser;
  try {
    const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
    browser = await chromium.launch({ headless: true, args, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference', acceptDownloads: true });
    const page = await context.newPage(), errors = [], external = [], offlineRequests = []; let offline = false;
    page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); }); page.on('dialog', dialog => dialog.accept());
    page.on('request', request => { const url = request.url(); if (offline && !/^(file:|data:|blob:)/.test(url)) offlineRequests.push(url); if (!url.startsWith(base + '/') && !/^(file:|data:|blob:)/.test(url)) external.push(url); });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.hero-primary').getAttribute('href'), '#living-canvas');
    assert.equal(await page.locator('#garden-generation').innerText(), '0'); assert.equal(await page.locator('#garden-population').innerText(), '46');
    assert.equal(await page.locator('#garden-canvas').getAttribute('width'), '1152');
    await page.click('#garden-clear'); assert.equal(await page.locator('#garden-population').innerText(), '0');
    await page.click('#garden-undo'); assert.equal(await page.locator('#garden-population').innerText(), '46');
    await page.click('#garden-redo'); assert.equal(await page.locator('#garden-population').innerText(), '0');

    // Draw a real interpolated pointer stroke, then stamp, erase and use keyboard/precise editing.
    await page.click('[data-garden-ink="2"]'); await page.locator('#garden-canvas').scrollIntoViewIfNeeded();
    let rect = await page.locator('#garden-canvas').boundingBox();
    const pt = (x, y) => ({ x: rect.x + (x + .5) * rect.width / G.COLS, y: rect.y + (y + .5) * rect.height / G.ROWS });
    await page.mouse.move(pt(3, 3).x, pt(3, 3).y); await page.mouse.down(); await page.mouse.move(pt(8, 3).x, pt(8, 3).y, { steps: 1 }); await page.mouse.up();
    assert.equal(await page.locator('#garden-population').innerText(), '6', 'continuous interpolation paints every crossed cell');
    await page.click('#garden-undo'); assert.equal(await page.locator('#garden-population').innerText(), '0'); await page.click('#garden-redo'); assert.equal(await page.locator('#garden-population').innerText(), '6');
    await page.selectOption('#garden-brush', 'glider'); assert.equal(await page.locator('#garden-size').isDisabled(), true);
    await page.locator('#garden-canvas').scrollIntoViewIfNeeded(); rect = await page.locator('#garden-canvas').boundingBox(); await page.mouse.click(pt(14, 6).x, pt(14, 6).y); assert.equal(await page.locator('#garden-population').innerText(), '11');
    await page.click('[data-garden-ink="0"]'); assert.equal(await page.locator('#garden-brush').inputValue(), 'free');
    await page.locator('#garden-canvas').scrollIntoViewIfNeeded(); rect = await page.locator('#garden-canvas').boundingBox(); await page.mouse.click(pt(3, 3).x, pt(3, 3).y); assert.equal(await page.locator('#garden-population').innerText(), '10');
    if (mobile) { await page.click('[data-garden-ink="4"]'); await page.locator('#garden-canvas').scrollIntoViewIfNeeded(); rect = await page.locator('#garden-canvas').boundingBox(); await page.touchscreen.tap(pt(0, 0).x, pt(0, 0).y); assert.equal(await page.locator('#garden-population').innerText(), '11'); }
    await page.click('#garden-precise > summary'); await page.click('#garden-precise details summary');
    await page.click('[data-garden-ink="3"]'); await page.fill('#garden-column', '20'); await page.fill('#garden-row', '14'); await page.click('#garden-apply-cell');
    assert.match(await page.locator('#garden-cell-status').innerText(), /Column 20, row 14: ink 3/);
    assert.equal((await page.locator('#garden-text-grid').textContent()).split('\n')[13][19], '3');
    await page.fill('#garden-column', '25'); await page.click('#garden-apply-cell'); assert.match(await page.locator('#garden-cell-status').innerText(), /column from 1–24/i);
    await page.locator('#garden-canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
    assert.match(await page.locator('#garden-canvas').getAttribute('aria-label'), /Column 21, row 14: ink 3/);

    // Create a glider, step/back/reset, keep the evolved moment, and export a real PNG.
    await page.click('#garden-clear'); await page.click('[data-garden-ink="1"]'); await page.selectOption('#garden-brush', 'glider');
    await page.fill('#garden-column', '9'); await page.fill('#garden-row', '7'); await page.click('#garden-apply-cell');
    assert.equal(await page.locator('#garden-population').innerText(), '5');
    const start = G.paint(G.blank(), [[8, 6]], 1, 'glider'); let evolved = start.slice();
    for (let i = 0; i < 4; i++) { await page.click('#garden-step'); evolved = G.nextGeneration(evolved, [3], [2, 3], false); }
    assert.equal(await page.locator('#garden-generation').innerText(), '4'); await page.click('#garden-back');
    assert.equal(await page.locator('#garden-generation').innerText(), '3'); await page.click('#garden-step');
    await page.click('#garden-reset'); assert.equal(await page.locator('#garden-generation').innerText(), '0'); assert.equal(await page.locator('#garden-population').innerText(), '5');
    for (let i = 0; i < 4; i++) await page.click('#garden-step');
    const [png] = await Promise.all([page.waitForEvent('download'), page.click('#garden-png')]); const pngBytes = fs.readFileSync(await png.path());
    assert.deepEqual([...pngBytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]); assert.equal(pngBytes.readUInt32BE(16), 1152); assert.equal(pngBytes.readUInt32BE(20), 768);
    const liveIndex = evolved.findIndex(Boolean);
    const pixels = await page.evaluate(async ({ bytes, liveIndex }) => {
      const raw = Uint8Array.from(atob(bytes), char => char.charCodeAt(0)), image = await createImageBitmap(new Blob([raw], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height; const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const sample = index => Array.from(ctx.getImageData((index % 24) * 48 + 24, Math.floor(index / 24) * 48 + 24, 1, 1).data);
      return { live: sample(liveIndex), empty: sample(0) };
    }, { bytes: pngBytes.toString('base64'), liveIndex });
    assert.notDeepEqual(pixels.live, pixels.empty, 'export contains the evolved artwork, not a blank picture');
    await page.click('#garden-library > summary');
    const [preCapture] = await Promise.all([page.waitForEvent('download'), page.click('#garden-export')]);
    assert.deepEqual(JSON.parse(fs.readFileSync(await preCapture.path(), 'utf8')).cells, start, 'project stores the starting design until capture');
    await page.click('#garden-capture'); assert.equal(await page.locator('#garden-generation').innerText(), '0');
    const [captured] = await Promise.all([page.waitForEvent('download'), page.click('#garden-export')]);
    assert.deepEqual(JSON.parse(fs.readFileSync(await captured.path(), 'utf8')).cells, evolved, 'keep moment makes visible frame the saved seed');
    await page.click('#garden-undo'); assert.equal(await page.locator('#garden-generation').innerText(), '4'); await page.click('#garden-redo'); assert.equal(await page.locator('#garden-generation').innerText(), '0');

    await page.selectOption('#garden-rule', 'highlife'); assert.equal(await page.locator('#garden-rule-code').innerText(), 'B36 / S23');
    await page.click('#garden-rule-editor > summary'); await page.click('#garden-birth [data-count="0"]');
    assert.equal(await page.locator('#garden-rule').inputValue(), 'custom'); assert.equal(await page.locator('#garden-rule-code').innerText(), 'B036 / S23');
    await page.selectOption('#garden-edge', 'wrap'); await page.selectOption('#garden-theme', 'ocean'); await page.selectOption('#garden-shape', 'tile');
    await page.fill('#garden-name', 'My colored world'); await page.click('#garden-save');
    assert.equal(await page.locator('#garden-draft').innerText(), 'SAVED LOCALLY');
    await page.reload({ waitUntil: 'networkidle' }); await page.click('#garden-library > summary'); await page.selectOption('#garden-saved', 'My colored world'); await page.click('#garden-load');
    assert.equal(await page.locator('#garden-theme').inputValue(), 'ocean'); assert.equal(await page.locator('#garden-shape').inputValue(), 'tile');
    assert.equal(await page.locator('#garden-edge').inputValue(), 'wrap'); assert.equal(await page.locator('#garden-rule-code').innerText(), 'B036 / S23');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#garden-export')]); const project = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(project.cells, evolved); assert.deepEqual(project.birth, [0, 3, 6]); assert.equal(project.wrap, true);

    // Saving a design during playback preserves the starting seed; painting a frame pauses and captures it.
    await page.selectOption('#garden-rule', 'life'); await page.selectOption('#garden-brush', 'free'); await page.click('[data-garden-ink="4"]');
    await page.click('#garden-play'); assert.equal(await page.locator('#garden-play').getAttribute('aria-pressed'), 'true');
    await page.waitForFunction(() => Number(document.querySelector('#garden-generation').textContent) >= 2);
    await page.locator('#garden-canvas').scrollIntoViewIfNeeded(); rect = await page.locator('#garden-canvas').boundingBox(); await page.mouse.click(pt(0, 0).x, pt(0, 0).y);
    assert.equal(await page.locator('#garden-play').getAttribute('aria-pressed'), 'false'); assert.equal(await page.locator('#garden-generation').innerText(), '0');
    await page.click('#garden-undo'); assert.ok(Number(await page.locator('#garden-generation').innerText()) >= 2);
    await page.emulateMedia({ reducedMotion: 'reduce' }); const oldGen = Number(await page.locator('#garden-generation').innerText());
    await page.click('#garden-play'); assert.equal(await page.locator('#garden-play').getAttribute('aria-pressed'), 'false'); assert.equal(Number(await page.locator('#garden-generation').innerText()), oldGen + 1);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Conflict decisions recheck storage before replacing another tab's newer version.
    const key = 'algorithm-lab.living-canvas.projects.v1'; const before = await page.evaluate(key => localStorage.getItem(key), key);
    await page.evaluate(key => { const records = JSON.parse(localStorage.getItem(key)); records[0].cells[0] = 2; localStorage.setItem(key, JSON.stringify(records)); }, key);
    await page.click('#garden-save'); assert.match(await page.locator('#garden-confirm-message').innerText(), /Replace the saved design/);
    await page.evaluate(key => { const records = JSON.parse(localStorage.getItem(key)); records[0].cells[0] = 3; localStorage.setItem(key, JSON.stringify(records)); }, key);
    await page.click('#garden-confirm-accept'); await page.waitForFunction(() => document.querySelector('#garden-project-status').textContent.includes('changed in another tab'));
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].cells[0], key), 3);
    await page.evaluate(({ key, before }) => localStorage.setItem(key, before), { key, before });
    await page.click('#garden-new'); assert.match(await page.locator('#garden-confirm-message').innerText(), /unsaved changes/i); await page.click('#garden-confirm-cancel');
    assert.equal(await page.locator('#garden-name').inputValue(), 'My colored world'); await page.click('#garden-new'); await page.click('#garden-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#garden-name').value === 'Untitled canvas'); assert.equal(await page.locator('#garden-population').innerText(), '0');
    await page.locator('#garden-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
    await page.waitForFunction(() => document.querySelector('#garden-project-status').textContent.includes('not a supported'));
    project.name = '<img src=x onerror=alert(1)>';
    await page.locator('#garden-file').setInputFiles({ name: 'design.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await page.waitForFunction(() => document.querySelector('#garden-name').value.startsWith('<img'));
    await page.click('#garden-save'); assert.equal(await page.locator('#garden-saved img').count(), 0); assert.equal(await page.locator('#garden-saved option').count(), 3);
    await page.click('#garden-delete'); await page.click('#garden-confirm-accept'); await page.waitForFunction(() => document.querySelector('#garden-project-status').textContent.includes('Deleted the saved copy'));
    assert.equal(await page.locator('#garden-population').innerText(), '5');

    // Corrupt or full storage is never silently overwritten.
    const original = await page.evaluate(key => localStorage.getItem(key), key); await page.evaluate(key => localStorage.setItem(key, '{broken'), key);
    await page.reload({ waitUntil: 'networkidle' }); await page.click('#garden-library > summary'); assert.match(await page.locator('#garden-project-status').innerText(), /unavailable or unreadable/);
    await page.fill('#garden-name', 'Do not overwrite'); await page.click('#garden-save'); assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken');
    await page.evaluate(({ key, original }) => localStorage.setItem(key, original), { key, original }); await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(key => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('Full', 'QuotaExceededError'); return set.call(this, k, v); }; }, key);
    await page.fill('#garden-name', 'Quota test'); await page.click('#garden-save'); assert.match(await page.locator('#garden-project-status').innerText(), /blocked or full/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), original);
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })); assert.ok(layout.scroll <= layout.width, `page overflowed: ${JSON.stringify(layout)}`);
    if (mobile) {
      await page.click('#garden-rule-editor > summary');
      const targets = await page.locator('#garden-play, #garden-step, #garden-clear, #garden-save, #garden-png, #garden-brush, #garden-name, .garden-ink, .garden-count-buttons button').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { id: element.id || element.textContent.trim(), width: r.width, height: r.height }; }));
      assert.ok(targets.every(target => target.width >= 44 && target.height >= 44), `touch targets: ${JSON.stringify(targets)}`);
      const selects = await page.locator('#garden-brush, #garden-size, #garden-rule, #garden-edge, #garden-theme, #garden-shape').evaluateAll(elements => {
        const ctx = document.createElement('canvas').getContext('2d');
        return elements.map(element => {
          const css = getComputedStyle(element); ctx.font = `${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
          return { id: element.id, textWidth: ctx.measureText(element.selectedOptions[0].textContent).width, available: element.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight) - 20 };
        });
      });
      assert.ok(selects.every(select => select.textWidth <= select.available), `clipped select labels: ${JSON.stringify(selects)}`);
    }
    // In-page protection remains available inside an iframe without native modals/storage.
    await page.evaluate(url => { const frame = document.createElement('iframe'); frame.id = 'garden-embedded-test'; frame.sandbox = 'allow-scripts'; frame.src = url; frame.style.cssText = 'width:100%;height:900px;border:0'; document.body.append(frame); }, base + '/');
    const embedded = page.frameLocator('#garden-embedded-test'); await embedded.locator('#garden-name').fill('Frame draft'); await embedded.locator('#garden-library > summary').click(); await embedded.locator('#garden-new').click();
    assert.match(await embedded.locator('#garden-confirm-message').innerText(), /unsaved changes/i); await embedded.locator('#garden-confirm-cancel').click();
    await embedded.locator('#garden-new').click(); await embedded.locator('#garden-confirm-accept').click();
    const child = await (await page.locator('#garden-embedded-test').elementHandle()).contentFrame(); await child.waitForFunction(() => document.querySelector('#garden-name').value === 'Untitled canvas');

    // The actual single-file version works offline, including image and project downloads.
    await context.setOffline(true); offline = true; await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href, { waitUntil: 'load' });
    await page.click('#garden-clear'); await page.click('#garden-precise > summary'); await page.click('[data-garden-ink="2"]'); await page.fill('#garden-column', '4'); await page.fill('#garden-row', '5'); await page.click('#garden-apply-cell');
    await page.fill('#garden-name', 'Offline artwork'); await page.click('#garden-save'); await page.reload({ waitUntil: 'load' }); await page.click('#garden-library > summary');
    await page.selectOption('#garden-saved', 'Offline artwork'); await page.click('#garden-load'); assert.equal(await page.locator('#garden-population').innerText(), '1');
    const [offlineJson] = await Promise.all([page.waitForEvent('download'), page.click('#garden-export')]); const offProject = JSON.parse(fs.readFileSync(await offlineJson.path(), 'utf8')); assert.equal(offProject.cells[4 * G.COLS + 3], 2);
    offProject.name = 'Offline import'; offProject.cells[0] = 4; await page.locator('#garden-file').setInputFiles({ name: 'offline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(offProject)) });
    await page.waitForFunction(() => document.querySelector('#garden-name').value === 'Offline import'); assert.equal(await page.locator('#garden-population').innerText(), '2');
    const [offlinePng] = await Promise.all([page.waitForEvent('download'), page.click('#garden-png')]); assert.equal(fs.readFileSync(await offlinePng.path()).toString('ascii', 1, 4), 'PNG');
    assert.deepEqual(offlineRequests, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(`PASS: creative canvas drawing, simulation, undo, custom rules, PNG, storage and offline at ${width}px`);
    await context.close();
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(problem => { console.error(problem); process.exitCode = 1; });
