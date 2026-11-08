/* Optional browser regression for opt-in soundscapes and interaction sonification. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..'), width = Number(process.argv[2] || 1440), mobile = width <= 520;
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
    await page.addInitScript(() => {
      const Native = window.AudioContext || window.webkitAudioContext; if (!Native) return;
      window.__audioCreated = 0; window.__oscStarted = [];
      const oscillator = Native.prototype.createOscillator, gain = Native.prototype.createGain;
      Native.prototype.createOscillator = function (...args) { const node = oscillator.apply(this, args), start = node.start; node.start = function (time) { window.__oscStarted.push({ frequency: this.frequency.value, time }); return start.call(this, time); }; return node; };
      Native.prototype.createGain = function (...args) { const node = gain.apply(this, args); if (!window.__firstSoundGain) window.__firstSoundGain = node; return node; };
      window.AudioContext = class extends Native { constructor(...args) { super(...args); window.__audioCreated++; window.__soundContext = this; } };
    });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#sound-indicator').innerText(), 'OFF'); assert.equal(await page.locator('#sound-music').getAttribute('aria-pressed'), 'false'); assert.equal(await page.locator('#sound-effects').getAttribute('aria-pressed'), 'false'); assert.equal(await page.locator('#sound-off').isDisabled(), true);
    await page.evaluate(() => { const original = window.LabSound.effect; window.__soundEvents = []; window.LabSound.effect = (kind, value) => { window.__soundEvents.push({ kind, value }); return original(kind, value); }; });
    // No context, audio, or timer-driven music is created before an explicit opt-in.
    await page.click('#garden-clear'); await page.click('#garden-step'); await page.click('#studio-step'); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__audioCreated), 0); assert.equal(await page.evaluate(() => window.__oscStarted.length), 0);
    await page.click('#sound-summary'); assert.equal(await page.locator('#sound-control').evaluate(node => node.open), true);
    if (mobile) {
      const sizes = await page.locator('#sound-summary, #sound-music, #sound-effects, #sound-off, #sound-close, #sound-mood, #sound-volume').evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { id: node.id, width: r.width, height: r.height }; }));
      assert.ok(sizes.every(size => size.width >= 44 && size.height >= 44), `sound controls need touch targets: ${JSON.stringify(sizes)}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.setViewportSize({ width, height: 480 }); await page.locator('#sound-volume').scrollIntoViewIfNeeded();
      const shortScreen = await page.evaluate(() => { const panel = document.querySelector('.soundscape-panel').getBoundingClientRect(), slider = document.querySelector('#sound-volume').getBoundingClientRect(), summary = document.querySelector('#sound-summary').getBoundingClientRect(); return { panelTop: panel.top, sliderTop: slider.top, sliderBottom: slider.bottom, summaryTop: summary.top, height: innerHeight }; });
      assert.ok(shortScreen.panelTop >= 0 && shortScreen.sliderTop >= 0 && shortScreen.sliderBottom <= shortScreen.summaryTop && shortScreen.summaryTop < shortScreen.height, `sound panel remains usable on a short screen: ${JSON.stringify(shortScreen)}`);
      await page.setViewportSize({ width, height: 900 });
    }
    await page.click('#sound-effects'); await page.waitForFunction(() => document.querySelector('#sound-effects').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.evaluate(() => window.__audioCreated), 1); assert.ok(await page.evaluate(() => window.__oscStarted.length > 0), 'enabling effects plays an audible confirmation');
    await page.click('#sound-close'); assert.equal(await page.locator('#sound-control').evaluate(node => node.open), false);

    // Painting produces pitches from height; growth has its own population cue.
    await page.click('#garden-reset'); await page.click('#garden-clear');
    await page.locator('#garden-canvas').scrollIntoViewIfNeeded(); const rect = await page.locator('#garden-canvas').boundingBox();
    const point = (x, y) => ({ x: rect.x + (x + .5) * rect.width / 24, y: rect.y + (y + .5) * rect.height / 16 });
    await page.waitForTimeout(160); let count = await page.evaluate(() => window.__oscStarted.length);
    await page.mouse.click(point(4, 2).x, point(4, 2).y); assert.deepEqual(await page.evaluate(() => window.__soundEvents.at(-1)), { kind: 'paint', value: 6 }); assert.ok(await page.evaluate(n => window.__oscStarted.length > n, count));
    await page.waitForTimeout(160); await page.mouse.click(point(4, 14).x, point(4, 14).y); assert.deepEqual(await page.evaluate(() => window.__soundEvents.at(-1)), { kind: 'paint', value: 0 });
    await page.waitForTimeout(160); count = await page.evaluate(() => window.__oscStarted.length); await page.click('#garden-step');
    assert.equal(await page.evaluate(() => window.__soundEvents.at(-1).kind), 'grow'); assert.ok(await page.evaluate(n => window.__oscStarted.length > n, count));

    // Each other workshop supplies events from its actual algorithm or answer.
    async function expectCue(selector, kind) {
      await page.waitForTimeout(160); const before = await page.evaluate(() => window.__oscStarted.length); await page.click(selector);
      assert.equal(await page.evaluate(() => window.__soundEvents.at(-1).kind), kind, `${selector} should produce ${kind}`);
      assert.ok(await page.evaluate(n => window.__oscStarted.length > n, before), `${selector} schedules real Web Audio oscillators`);
    }
    await expectCue('#studio-step', 'step'); await expectCue('#knapsack-step', 'step');
    await page.locator('input[name="weighted-tool"][value="3"]').check(); await expectCue('#weighted-grid [data-index="0"]', 'paint');
    await expectCue('#weighted-step', 'step');
    await page.click('#huffman-workshop > summary'); await expectCue('#huffman-step', 'step');
    await expectCue('#step-button', 'step');
    const answer = await page.evaluate(() => window.AlgorithmPractice.questions.sorting[0].answer);
    await page.locator(`#practice-options input[value="${(answer + 1) % 3}"]`).check(); await expectCue('#practice-submit', 'try');
    await page.locator(`#practice-options input[value="${answer}"]`).check(); await expectCue('#practice-submit', 'success');

    // Effects can be disabled without muting music or creating more oscillators.
    await page.click('#sound-summary'); await page.click('#sound-effects'); assert.equal(await page.locator('#sound-effects').getAttribute('aria-pressed'), 'false');
    count = await page.evaluate(() => window.__oscStarted.length); await page.click('#garden-step'); await page.waitForTimeout(300); assert.equal(await page.evaluate(() => window.__oscStarted.length), count);
    await page.click('#sound-summary'); await page.click('#sound-music'); await page.waitForFunction(() => document.querySelector('#sound-music').getAttribute('aria-pressed') === 'true');
    count = await page.evaluate(() => window.__oscStarted.length); await page.waitForTimeout(900); assert.ok(await page.evaluate(n => window.__oscStarted.length > n, count), 'music schedules a continuing melody');
    await page.selectOption('#sound-mood', 'night'); assert.equal(await page.locator('#sound-mood').inputValue(), 'night');
    await page.evaluate(() => { const context = window.__soundContext, analyser = context.createAnalyser(), silent = context.createGain(); analyser.fftSize = 2048; silent.gain.value = 0; window.__firstSoundGain.connect(analyser); analyser.connect(silent); silent.connect(context.destination); window.__soundAnalyser = analyser; });
    await page.waitForTimeout(300);
    const audible = await page.evaluate(() => { const buffer = new Float32Array(window.__soundAnalyser.fftSize); window.__soundAnalyser.getFloatTimeDomainData(buffer); return Math.max(...buffer.map(Math.abs)); });
    assert.ok(audible > .0001, `the soundtrack produces real non-silent output (${audible})`);
    await page.locator('#sound-volume').evaluate(input => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(240); assert.equal(await page.locator('#sound-volume-value').innerText(), '0%'); assert.ok(await page.evaluate(() => window.__firstSoundGain.gain.value < .001));
    const muted = await page.evaluate(() => { const buffer = new Float32Array(window.__soundAnalyser.fftSize); window.__soundAnalyser.getFloatTimeDomainData(buffer); return Math.max(...buffer.map(Math.abs)); });
    assert.ok(muted < .0001, `zero volume silences the actual output (${muted})`); assert.match(await page.locator('#sound-status').innerText(), /muted/i);
    await page.locator('#sound-volume').evaluate(input => { input.value = '60'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(180); assert.ok(Math.abs(await page.evaluate(() => window.__firstSoundGain.gain.value) - .39) < .01);
    await page.click('#sound-effects'); await page.waitForFunction(() => document.querySelector('#sound-effects').getAttribute('aria-pressed') === 'true');

    // Beat Maker has its own sound and temporarily takes priority over the soundtrack and effects.
    await page.click('#beat-play'); await page.waitForFunction(() => document.querySelector('#beat-play').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#sound-indicator').innerText(), 'PAUSED'); assert.match(await page.locator('#sound-status').textContent(), /Beat Maker plays/);
    await page.click('#sound-summary'); await page.click('#sound-music'); await page.click('#sound-music');
    await page.waitForFunction(() => document.querySelector('#sound-music').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.locator('#sound-indicator').innerText(), 'PAUSED', 'enabling music during a beat waits rather than mixing');
    await page.click('#sound-off'); assert.equal(await page.locator('#beat-play').getAttribute('aria-pressed'), 'true', 'soundscape mute leaves Beat Maker playing');
    await page.click('#sound-music'); await page.waitForFunction(() => document.querySelector('#sound-music').getAttribute('aria-pressed') === 'true');
    await page.click('#sound-effects'); await page.waitForFunction(() => document.querySelector('#sound-effects').getAttribute('aria-pressed') === 'true');
    await page.waitForTimeout(250); count = await page.evaluate(() => window.__oscStarted.length); await page.click('#garden-step'); await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => window.__oscStarted.length), count, 'soundscape and effects do not compete with Beat Maker playback');
    await page.click('#beat-play'); await page.waitForFunction(() => document.querySelector('#beat-play').getAttribute('aria-pressed') === 'false');
    assert.equal(await page.locator('#sound-indicator').innerText(), 'ON'); count = await page.evaluate(() => window.__oscStarted.length); await page.waitForTimeout(1000);
    assert.ok(await page.evaluate(n => window.__oscStarted.length > n, count), 'music resumes after the beat is paused'); await page.click('#beat-stop');
    await page.click('#sound-summary'); await page.click('#sound-off');
    assert.equal(await page.locator('#sound-music').getAttribute('aria-pressed'), 'false'); assert.equal(await page.locator('#sound-effects').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#sound-off').isDisabled(), true); count = await page.evaluate(() => window.__oscStarted.length); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__oscStarted.length), count, 'turn both off stops the music scheduler');
    await page.click('#sound-music'); await page.waitForFunction(() => document.querySelector('#sound-music').getAttribute('aria-pressed') === 'true');
    await page.click('#sound-effects'); await page.waitForFunction(() => document.querySelector('#sound-effects').getAttribute('aria-pressed') === 'true');

    // Hidden tabs never restart audio without a new user gesture.
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('#sound-indicator').innerText(), 'OFF'); assert.equal(await page.locator('#sound-music').getAttribute('aria-pressed'), 'false'); assert.equal(await page.locator('#sound-effects').getAttribute('aria-pressed'), 'false');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); count = await page.evaluate(() => window.__oscStarted.length); await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.__oscStarted.length), count); assert.match(await page.locator('#sound-status').textContent(), /page was hidden/i);
    if (!await page.locator('#sound-control').evaluate(node => node.open)) await page.click('#sound-summary');
    await page.locator('#sound-summary').focus(); await page.keyboard.press('Escape'); assert.equal(await page.locator('#sound-control').evaluate(node => node.open), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'sound-summary');

    // Unsupported Web Audio keeps the rest of the lab usable and reports the reason.
    const fallback = await context.newPage(); await fallback.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    await fallback.goto(base + '/?without-audio=1', { waitUntil: 'networkidle' }); await fallback.click('#sound-summary'); await fallback.click('#sound-music');
    assert.equal(await fallback.locator('#sound-music').getAttribute('aria-pressed'), 'false'); assert.match(await fallback.locator('#sound-status').textContent(), /unavailable/i);
    await fallback.click('#sound-effects'); assert.equal(await fallback.locator('#sound-effects').getAttribute('aria-pressed'), 'false'); await fallback.click('#garden-step'); assert.equal(await fallback.locator('#garden-generation').innerText(), '1'); await fallback.close();

    // A canceled pending resume cannot turn music on later.
    const slow = await context.newPage(); await slow.addInitScript(() => {
      const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
      window.__fakeStarts = 0; window.AudioContext = class { constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; } createGain() { return { gain: param(), connect() {}, disconnect() {} }; } createOscillator() { return { frequency: param(), connect() {}, disconnect() {}, start() { window.__fakeStarts++; }, stop() {} }; } resume() { return new Promise(resolve => { window.__resolveAudio = () => { this.state = 'running'; resolve(); }; }); } suspend() { this.state = 'suspended'; return Promise.resolve(); } };
    });
    await slow.goto(base + '/?slow-audio=1', { waitUntil: 'networkidle' }); await slow.click('#sound-summary'); await slow.click('#sound-music');
    assert.equal(await slow.locator('#sound-music').getAttribute('aria-busy'), 'true'); await slow.click('#sound-off'); await slow.evaluate(() => window.__resolveAudio()); await slow.waitForTimeout(250);
    assert.equal(await slow.locator('#sound-music').getAttribute('aria-pressed'), 'false'); assert.equal(await slow.evaluate(() => window.__fakeStarts), 0);
    await slow.reload({ waitUntil: 'networkidle' }); await slow.click('#sound-summary'); await slow.click('#sound-music');
    await slow.waitForFunction(() => document.querySelector('#sound-status').textContent.includes('did not start'), null, { timeout: 5000 });
    assert.equal(await slow.locator('#sound-music').getAttribute('aria-pressed'), 'false'); await slow.evaluate(() => window.__resolveAudio()); await slow.waitForTimeout(100);
    assert.equal(await slow.evaluate(() => window.__fakeStarts), 0, 'a late resume after timeout stays silent'); await slow.close();

    // A rapid hide/return waits for an in-flight suspend before trying to resume.
    const race = await context.newPage(); await race.addInitScript(() => {
      const param = () => ({ value: 0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
      window.__resumes = 0; window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } createGain() { return { gain: param(), connect() {}, disconnect() {} }; } createOscillator() { return { frequency: param(), connect() {}, disconnect() {}, start() {}, stop() {} }; } resume() { window.__resumes++; this.state = 'running'; return Promise.resolve(); } suspend() { return new Promise(resolve => { window.__finishSuspend = () => { this.state = 'suspended'; resolve(); }; }); } };
    });
    await race.goto(base + '/?suspend-race=1', { waitUntil: 'networkidle' }); await race.click('#sound-summary'); await race.click('#sound-music');
    await race.waitForFunction(() => document.querySelector('#sound-music').getAttribute('aria-pressed') === 'true');
    await race.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await race.click('#sound-music'); assert.equal(await race.locator('#sound-music').getAttribute('aria-busy'), 'true'); assert.equal(await race.evaluate(() => window.__resumes), 0);
    await race.evaluate(() => window.__finishSuspend()); await race.waitForFunction(() => document.querySelector('#sound-music').getAttribute('aria-pressed') === 'true');
    assert.equal(await race.evaluate(() => window.__resumes), 1); await race.close();

    // The single-file app works without network and never autoplays on reload.
    await context.setOffline(true); offline = true; await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href, { waitUntil: 'load' });
    assert.equal(await page.locator('#sound-indicator').innerText(), 'OFF'); assert.equal(await page.evaluate(() => window.__audioCreated), 0);
    await page.click('#sound-summary'); await page.click('#sound-effects'); await page.waitForFunction(() => document.querySelector('#sound-effects').getAttribute('aria-pressed') === 'true');
    count = await page.evaluate(() => window.__oscStarted.length); await page.waitForTimeout(160); await page.click('#garden-step'); assert.ok(await page.evaluate(n => window.__oscStarted.length > n, count));
    await page.click('#sound-summary'); await page.click('#sound-music'); await page.waitForFunction(() => document.querySelector('#sound-music').getAttribute('aria-pressed') === 'true');
    await page.reload({ waitUntil: 'load' }); assert.equal(await page.locator('#sound-indicator').innerText(), 'OFF'); assert.equal(await page.evaluate(() => window.__audioCreated), 0);
    assert.deepEqual(offlineRequests, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(`PASS: optional music, workshop sound effects, Beat Maker priority, controls and offline at ${width}px`); await context.close();
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(problem => { console.error(problem); process.exitCode = 1; });
