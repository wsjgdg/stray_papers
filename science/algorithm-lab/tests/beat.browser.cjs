/* Optional browser regression for the creative Beat Maker. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const B = require('../beat-model.js');
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
    assert.equal(await page.locator('a[href="#beat-lab"]').count(), 2); assert.equal(await page.locator('.beat-cell').count(), 64);
    assert.equal(await page.locator('#beat-name').inputValue(), 'Little groove'); assert.equal(await page.locator('#beat-position').innerText(), 'READY TO PLAY');
    const order = await page.evaluate(() => { const controls = document.querySelector('.beat-controls'), board = document.querySelector('.beat-board'), a = controls.getBoundingClientRect(), b = board.getBoundingClientRect(); return { dom: !!(controls.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING), left: a.left < b.left, above: a.bottom <= b.top + 1 }; });
    assert.ok(order.dom && (mobile ? order.above : order.left), `visual and keyboard order should match: ${JSON.stringify(order)}`);
    const cell = (track, step) => page.locator(`.beat-cell[data-track="${track}"][data-step="${step}"]`);
    const level = async (track, step) => (await cell(track, step).getAttribute('class')).match(/level-(\d)/)[1];
    assert.equal(await level(0, 1), '0'); await cell(0, 1).click(); assert.equal(await level(0, 1), '1');
    await cell(0, 1).click(); assert.equal(await level(0, 1), '2'); await cell(0, 1).click(); assert.equal(await level(0, 1), '0');
    await page.click('#beat-undo'); assert.equal(await level(0, 1), '2'); await page.click('#beat-redo'); assert.equal(await level(0, 1), '0');
    await page.click('#beat-clear-track'); assert.ok((await page.locator('.beat-track[data-track="0"] .level-0').count()) === 16);
    // A single pointer stroke interpolates the intervening steps and is one undoable edit.
    await cell(0, 0).scrollIntoViewIfNeeded(); const start = await cell(0, 0).boundingBox(), end = await cell(0, 3).boundingBox();
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 1 }); await page.mouse.up();
    for (let i = 0; i < 4; i++) assert.equal(await level(0, i), '1');
    await page.click('#beat-undo'); for (let i = 0; i < 4; i++) assert.equal(await level(0, i), '0');
    await page.click('#beat-redo'); for (let i = 0; i < 4; i++) assert.equal(await level(0, i), '1');
    if (mobile) { await cell(0, 4).tap(); assert.equal(await level(0, 4), '1'); }

    // Track picker and wheel are editable, including a keyboard-only path.
    await page.click('#beat-track-picker [data-pick="3"]'); assert.equal(await page.locator('#beat-selected-label').innerText(), 'TRACK 4');
    assert.equal(await page.locator('#beat-note').isEnabled(), true); await page.selectOption('#beat-note', '60');
    await page.locator('#beat-wheel').scrollIntoViewIfNeeded(); const wheel = await page.locator('#beat-wheel').boundingBox();
    await page.mouse.click(wheel.x + wheel.width / 2, wheel.y + wheel.height * .135); assert.equal(await level(3, 0), '1');
    await page.locator('#beat-wheel').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space'); assert.equal(await level(3, 1), '1');
    assert.match(await page.locator('#beat-wheel').getAttribute('aria-label'), /step 2 is soft/i);
    await cell(2, 5).focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate(() => document.activeElement.dataset.step), '6');
    const beforeKeyboard = await level(2, 6); await page.keyboard.press('Enter'); assert.equal(await level(2, 6), String((Number(beforeKeyboard) + 1) % 3));

    // Spread and rotate a deliberately different rhythm, then undo and redo it.
    await page.click('#beat-track-picker [data-pick="3"]');
    await page.locator('#beat-hits').evaluate(input => { input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#beat-rotation').evaluate(input => { input.value = '2'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#beat-generate'); const expected = B.evenRhythm(5, 2);
    for (let i = 0; i < 16; i++) assert.equal(Number(await level(3, i)), expected[i]);
    await page.click('#beat-undo'); assert.notDeepEqual(await Promise.all(Array.from({ length: 16 }, (_, i) => level(3, i))), expected.map(String));
    await page.click('#beat-redo'); for (let i = 0; i < 16; i++) assert.equal(Number(await level(3, i)), expected[i]);
    await page.click('#beat-remix'); const remixed = await Promise.all(Array.from({ length: 16 }, (_, i) => level(3, i)));
    assert.equal(remixed.filter((value, i) => Number(value) !== expected[i]).length, 3); await page.click('#beat-undo');

    // Actual Web Audio starts only on interaction; pause/resume and live editing work.
    await page.evaluate(() => { const prototype = AudioContext.prototype, original = prototype.createBufferSource; window.__playedBeatSources = 0; prototype.createBufferSource = function (...args) { window.__playedBeatSources++; return original.apply(this, args); }; });
    await page.click('#beat-play'); await page.waitForFunction(() => document.querySelector('#beat-play').getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => /STEP 0[2-9]/.test(document.querySelector('#beat-position').textContent)); assert.ok(await page.evaluate(() => window.__playedBeatSources > 0), 'playing starts synthesized audio sources');
    await page.click('#beat-play'); assert.equal(await page.locator('#beat-play').getAttribute('aria-pressed'), 'false');
    const paused = await page.locator('#beat-position').innerText(); assert.match(paused, /PAUSED/); await page.waitForTimeout(300); assert.equal(await page.locator('#beat-position').innerText(), paused);
    const firstResumedStep = page.evaluate(() => new Promise((resolve, reject) => { const node = document.querySelector('#beat-position'), timer = setTimeout(() => { observer.disconnect(); reject(new Error('Resume did not advance')); }, 3000), observer = new MutationObserver(() => { const match = node.textContent.match(/^STEP (\d+)/); if (match) { clearTimeout(timer); observer.disconnect(); resolve(Number(match[1])); } }); observer.observe(node, { childList: true, characterData: true, subtree: true }); }));
    await page.click('#beat-play'); assert.equal(await firstResumedStep, Number(paused.match(/STEP (\d+)/)[1]) % 16 + 1, 'resume continues with the next step');
    await page.waitForFunction(() => document.querySelector('#beat-play').getAttribute('aria-pressed') === 'true');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#beat-play').getAttribute('aria-pressed'), 'false'); assert.match(await page.locator('#beat-status').innerText(), /page was hidden/);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(100);
    assert.equal(await page.locator('#beat-play').getAttribute('aria-pressed'), 'false', 'returning to a tab never starts audio automatically');
    await page.click('#beat-play'); await page.waitForFunction(() => document.querySelector('#beat-play').getAttribute('aria-pressed') === 'true');
    await cell(1, 0).click(); assert.equal(await page.locator('#beat-play').getAttribute('aria-pressed'), 'true'); await page.click('#beat-stop');
    assert.equal(await page.locator('#beat-position').innerText(), 'READY TO PLAY');
    await page.locator('#beat-tempo').evaluate(input => { input.value = '135'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(await page.locator('#beat-tempo-value').innerText(), '135 BPM'); await page.click('#beat-undo'); assert.equal(await page.locator('#beat-tempo-value').innerText(), '110 BPM'); await page.click('#beat-redo');
    await page.click('#beat-track-picker [data-pick="0"]'); await page.selectOption('#beat-voice', 'chime'); await page.selectOption('#beat-note', '64');
    await page.click('[data-mute="2"]'); assert.equal(await page.locator('[data-mute="2"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { const prototype = AudioContext.prototype, original = prototype.createBufferSource; window.__beatSources = 0; prototype.createBufferSource = function (...args) { window.__beatSources++; return original.apply(this, args); }; });
    await cell(2, 1).click(); await page.waitForTimeout(100); assert.equal(await page.evaluate(() => window.__beatSources), 0, 'muted tracks do not audition');

    // Project JSON and the exported WAV are generated from the exact same composition.
    await page.fill('#beat-name', 'My groove'); await page.click('#beat-save'); assert.equal(await page.locator('#beat-draft').innerText(), 'SAVED LOCALLY');
    await page.click('#beat-library > summary');
    const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.click('#beat-export')]); const project = JSON.parse(fs.readFileSync(await jsonDownload.path(), 'utf8'));
    assert.equal(project.name, 'My groove'); assert.equal(project.bpm, 135); assert.equal(project.tracks[0].voice, 'chime'); assert.equal(project.tracks[0].note, 64); assert.equal(project.tracks[2].muted, true);
    const [wavDownload] = await Promise.all([page.waitForEvent('download'), page.click('#beat-wav')]); const wav = fs.readFileSync(await wavDownload.path());
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE'); assert.ok(wav.subarray(44).some(value => value));
    assert.equal(Buffer.compare(wav, Buffer.from(B.renderWav(project, 4))), 0, 'export matches the edited notes, sounds, mutes and tempo');
    await page.reload({ waitUntil: 'networkidle' }); await page.click('#beat-library > summary'); await page.selectOption('#beat-saved', 'My groove'); await page.click('#beat-load');
    assert.equal(await page.locator('#beat-tempo-value').innerText(), '135 BPM'); assert.equal(await page.locator('#beat-voice').inputValue(), 'chime'); assert.equal(await page.locator('#beat-note').inputValue(), '64');
    assert.equal(await page.locator('[data-mute="2"]').getAttribute('aria-pressed'), 'true');

    // Protect edits and detect another tab changing a project while confirmation is open.
    await cell(0, 10).click(); const key = 'algorithm-lab.beat-maker.projects.v1', before = await page.evaluate(key => localStorage.getItem(key), key);
    await page.evaluate(key => { const p = JSON.parse(localStorage.getItem(key)); p[0].tracks[0].steps[0] = (p[0].tracks[0].steps[0] + 1) % 3; localStorage.setItem(key, JSON.stringify(p)); }, key);
    await page.click('#beat-save'); assert.match(await page.locator('#beat-confirm-message').innerText(), /Replace the saved beat/);
    await page.evaluate(key => { const p = JSON.parse(localStorage.getItem(key)); p[0].tracks[0].steps[0] = (p[0].tracks[0].steps[0] + 1) % 3; localStorage.setItem(key, JSON.stringify(p)); }, key);
    await page.click('#beat-confirm-accept'); await page.waitForFunction(() => document.querySelector('#beat-project-status').textContent.includes('changed in another tab'));
    await page.evaluate(({ key, before }) => localStorage.setItem(key, before), { key, before });
    await page.click('#beat-new'); assert.match(await page.locator('#beat-confirm-message').innerText(), /unsaved changes/i); await page.click('#beat-confirm-cancel');
    assert.equal(await page.locator('#beat-name').inputValue(), 'My groove'); await page.click('#beat-new'); await page.click('#beat-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#beat-name').value === 'Untitled beat'); assert.equal(await page.locator('.beat-cell.level-0').count(), 64);
    await page.locator('#beat-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
    await page.waitForFunction(() => document.querySelector('#beat-project-status').textContent.includes('not a supported'));
    project.name = '<img src=x onerror=alert(1)>'; await page.locator('#beat-file').setInputFiles({ name: 'beat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await page.waitForFunction(() => document.querySelector('#beat-name').value.startsWith('<img')); await page.click('#beat-save');
    assert.equal(await page.locator('#beat-saved img').count(), 0); assert.equal(await page.locator('#beat-saved option').count(), 3);
    await page.click('#beat-delete'); await page.click('#beat-confirm-accept'); await page.waitForFunction(() => document.querySelector('#beat-project-status').textContent.includes('Deleted the saved copy'));
    assert.equal(await page.locator('#beat-name').inputValue(), '<img src=x onerror=alert(1)>');

    // Corrupt and full storage must not silently destroy existing work.
    const original = await page.evaluate(key => localStorage.getItem(key), key); await page.evaluate(key => localStorage.setItem(key, '{broken'), key);
    await page.reload({ waitUntil: 'networkidle' }); await page.click('#beat-library > summary'); assert.match(await page.locator('#beat-project-status').innerText(), /unavailable or unreadable/);
    await page.fill('#beat-name', 'Do not overwrite'); await page.click('#beat-save'); assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken');
    await page.evaluate(({ key, original }) => localStorage.setItem(key, original), { key, original }); await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(key => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('Full', 'QuotaExceededError'); return set.call(this, k, v); }; }, key);
    await page.fill('#beat-name', 'Quota test'); await page.click('#beat-save'); assert.match(await page.locator('#beat-project-status').innerText(), /blocked or full/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), original);
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })); assert.ok(layout.scroll <= layout.width, `page overflowed: ${JSON.stringify(layout)}`);
    if (mobile) {
      const targets = await page.locator('#beat-play, #beat-stop, #beat-save, #beat-wav, #beat-name, #beat-voice, #beat-note, .beat-cell, .beat-track-select, .beat-mute, #beat-track-picker button').evaluateAll(elements => elements.map(element => { const r = element.getBoundingClientRect(); return { id: element.id || element.textContent.trim(), width: r.width, height: r.height }; }));
      assert.ok(targets.every(target => target.width >= 44 && target.height >= 44), `touch targets: ${JSON.stringify(targets)}`);
    }
    // In-page protection still works in a sandboxed iframe with no native modals/storage.
    await page.evaluate(url => { const frame = document.createElement('iframe'); frame.id = 'beat-embedded-test'; frame.sandbox = 'allow-scripts'; frame.src = url; frame.style.cssText = 'width:100%;height:900px;border:0'; document.body.append(frame); }, base + '/');
    const embedded = page.frameLocator('#beat-embedded-test'); await embedded.locator('#beat-name').fill('Frame draft'); await embedded.locator('#beat-library > summary').click(); await embedded.locator('#beat-new').click();
    assert.match(await embedded.locator('#beat-confirm-message').innerText(), /unsaved changes/i); await embedded.locator('#beat-confirm-cancel').click(); await embedded.locator('#beat-new').click(); await embedded.locator('#beat-confirm-accept').click();
    const child = await (await page.locator('#beat-embedded-test').elementHandle()).contentFrame(); await child.waitForFunction(() => document.querySelector('#beat-name').value === 'Untitled beat');

    // Audio API unavailable: composition and WAV export remain useful.
    const fallback = await context.newPage(); await fallback.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    await fallback.goto(base + '/?noaudio=1', { waitUntil: 'networkidle' }); await fallback.click('#beat-play');
    assert.match(await fallback.locator('#beat-status').innerText(), /not available.*export a WAV/i);
    const [fallbackWav] = await Promise.all([fallback.waitForEvent('download'), fallback.click('#beat-wav')]); assert.equal(fs.readFileSync(await fallbackWav.path()).toString('ascii', 0, 4), 'RIFF'); await fallback.close();

    // The actual single-file version composes, saves and exports without a network.
    await context.setOffline(true); offline = true; await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href, { waitUntil: 'load' });
    await page.click('#beat-clear-all'); await cell(0, 0).click(); await page.fill('#beat-name', 'Offline groove'); await page.click('#beat-save');
    await page.reload({ waitUntil: 'load' }); await page.click('#beat-library > summary'); await page.selectOption('#beat-saved', 'Offline groove'); await page.click('#beat-load'); assert.equal(await level(0, 0), '1');
    const [offlineJson] = await Promise.all([page.waitForEvent('download'), page.click('#beat-export')]); const offProject = JSON.parse(fs.readFileSync(await offlineJson.path(), 'utf8')); assert.equal(offProject.tracks[0].steps[0], 1);
    offProject.name = 'Offline import'; offProject.tracks[1].steps[1] = 2; await page.locator('#beat-file').setInputFiles({ name: 'offline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(offProject)) });
    await page.waitForFunction(() => document.querySelector('#beat-name').value === 'Offline import'); assert.equal(await level(1, 1), '2');
    const [offlineWav] = await Promise.all([page.waitForEvent('download'), page.click('#beat-wav')]); assert.equal(fs.readFileSync(await offlineWav.path()).toString('ascii', 0, 4), 'RIFF');
    assert.deepEqual(offlineRequests, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(`PASS: creative beat composition, wheel, audio, remix, WAV, persistence and offline at ${width}px`); await context.close();
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(problem => { console.error(problem); process.exitCode = 1; });
