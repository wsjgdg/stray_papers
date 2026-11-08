/* Optional browser checks for the weighted-search and Huffman workshops. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');
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
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`; let browser;
  try {
    const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
    browser = await chromium.launch({ headless: true, args, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference', acceptDownloads: true });
    const page = await context.newPage(), errors = [], external = [], offlineRequests = []; let offline = false;
    await page.addInitScript(() => {
      let model; window.__huffmanCalls = 0;
      Object.defineProperty(window, 'AlgorithmMore', { configurable: true, get: () => model, set: value => {
        const original = value.huffmanTrace; value.huffmanTrace = (...args) => { window.__huffmanCalls++; return original(...args); }; model = value;
      } });
    });
    page.on('pageerror', problem => errors.push(problem.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('dialog', dialog => dialog.accept());
    page.on('request', request => {
      const url = request.url(); if (offline && !/^(file:|data:|blob:)/.test(url)) offlineRequests.push(url);
      if (!url.startsWith(base + '/') && !/^(file:|data:|blob:)/.test(url)) external.push(url);
    });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__huffmanCalls), 0, 'the closed Huffman workshop does not build a trace at startup');
    assert.equal(await page.locator('#weighted-grid [role=gridcell]').count(), 40);
    assert.equal(await page.locator('#weighted-grid [tabindex="0"]').count(), 1);
    await page.click('#weighted-step'); assert.match(await page.locator('#weighted-position').innerText(), /^1 \/ \d+$/);
    assert.match(await page.locator('#weighted-message').innerText(), /Settle/);
    assert.ok(await page.locator('#weighted-grid .frontier').count() > 0);
    await page.click('#weighted-end'); assert.equal(await page.locator('#weighted-cost').innerText(), '9'); assert.equal(await page.locator('#weighted-moves').innerText(), '9');
    assert.equal(await page.locator('#weighted-grid .path').count(), 10);
    await page.click('#weighted-back'); assert.equal(await page.locator('#weighted-state').innerText(), 'PAUSED');
    await page.click('#weighted-reset'); await page.click('#weighted-run'); assert.equal(await page.locator('#weighted-state').innerText(), 'PLAYING');
    await page.click('#weighted-run'); assert.equal(await page.locator('#weighted-state').innerText(), 'PAUSED');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.click('#weighted-reset'); await page.click('#weighted-run');
    assert.equal(await page.locator('#weighted-state').innerText(), 'FINISHED'); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.click('#weighted-compare summary'); assert.deepEqual(await page.locator('#weighted-compare-results tr').allTextContents(), ['Dijkstra99' + await page.locator('#weighted-compare-results tr:first-child td:last-child').innerText(), 'Breadth-first377' + await page.locator('#weighted-compare-results tr:last-child td:last-child').innerText()]);
    await page.selectOption('#weighted-algorithm', 'bfs'); await page.click('#weighted-end');
    assert.equal(await page.locator('#weighted-cost').innerText(), '37'); assert.equal(await page.locator('#weighted-moves').innerText(), '7');

    // Paint with the keyboard, move endpoints and protect them from walls.
    await page.locator('input[name="weighted-tool"][value="3"]').check();
    await page.locator('#weighted-grid [data-index="16"]').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.index), '17'); await page.keyboard.press('Space');
    assert.match(await page.locator('#weighted-grid [data-index="17"]').getAttribute('aria-label'), /entry cost 3/);
    assert.equal(await page.locator('#weighted-position').innerText(), '0 / 0');
    await page.locator('input[name="weighted-tool"][value="wall"]').check(); await page.locator('#weighted-grid [data-index="16"]').click();
    assert.match(await page.locator('#weighted-edit-status').innerText(), /Move the start or goal/);
    assert.match(await page.locator('#weighted-grid [data-index="16"]').getAttribute('aria-label'), /start/);
    await page.locator('input[name="weighted-tool"][value="goal"]').check(); await page.locator('#weighted-grid [data-index="18"]').click();
    assert.match(await page.locator('#weighted-grid [data-index="18"]').getAttribute('aria-label'), /goal/);
    await page.fill('#weighted-name', 'City grid'); await page.click('#weighted-save');
    assert.match(await page.locator('#weighted-project-status').innerText(), /Saved “City grid”/);
    await page.reload({ waitUntil: 'networkidle' }); await page.selectOption('#weighted-saved', 'City grid'); await page.click('#weighted-load');
    assert.equal(await page.locator('#weighted-algorithm').inputValue(), 'bfs');
    assert.match(await page.locator('#weighted-grid [data-index="17"]').getAttribute('aria-label'), /entry cost 3/);
    assert.match(await page.locator('#weighted-grid [data-index="18"]').getAttribute('aria-label'), /goal/);
    await page.click('#weighted-end'); assert.equal(await page.locator('#weighted-cost').innerText(), '9'); assert.equal(await page.locator('#weighted-moves').innerText(), '2');
    const [mapDownload] = await Promise.all([page.waitForEvent('download'), page.click('#weighted-export')]);
    const map = JSON.parse(fs.readFileSync(await mapDownload.path(), 'utf8')); assert.equal(map.name, 'City grid'); assert.equal(map.costs[17], 3); assert.equal(map.goal, 18);

    // An overwrite decision is rechecked after another tab changes the saved version.
    await page.locator('input[name="weighted-tool"][value="6"]').check(); await page.locator('#weighted-grid [data-index="17"]').click();
    const key = 'algorithm-lab.weighted.projects.v1'; const before = await page.evaluate(key => localStorage.getItem(key), key);
    await page.evaluate(key => { const items = JSON.parse(localStorage.getItem(key)); items[0].costs[17] = 4; localStorage.setItem(key, JSON.stringify(items)); }, key);
    await page.click('#weighted-save'); assert.match(await page.locator('#weighted-confirm-message').innerText(), /Replace the saved project/);
    await page.evaluate(key => { const items = JSON.parse(localStorage.getItem(key)); items[0].costs[17] = 5; localStorage.setItem(key, JSON.stringify(items)); }, key);
    await page.click('#weighted-confirm-accept'); await page.waitForFunction(() => document.querySelector('#weighted-project-status').textContent.includes('changed in another tab'));
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].costs[17], key), 5);
    assert.match(await page.locator('#weighted-grid [data-index="17"]').getAttribute('aria-label'), /entry cost 6/);
    await page.evaluate(({ key, before }) => localStorage.setItem(key, before), { key, before });
    await page.click('#weighted-new'); assert.match(await page.locator('#weighted-confirm-message').innerText(), /unsaved changes/i);
    await page.click('#weighted-confirm-cancel'); assert.equal(await page.locator('#weighted-name').inputValue(), 'City grid');
    await page.click('#weighted-new'); await page.click('#weighted-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#weighted-name').value === 'The costly shortcut');

    await page.locator('#weighted-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
    await page.waitForFunction(() => document.querySelector('#weighted-project-status').textContent.includes('not a supported'));
    const blocked = { ...map, name: 'Blocked <img src=x>', cols: 3, rows: 1, costs: [1, 0, 1], start: 0, goal: 2, algorithm: 'dijkstra' };
    await page.locator('#weighted-file').setInputFiles({ name: 'blocked.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(blocked)) });
    await page.waitForFunction(() => document.querySelector('#weighted-name').value.startsWith('Blocked'));
    assert.equal(await page.locator('#weighted-grid img').count(), 0); await page.click('#weighted-end');
    assert.equal(await page.locator('#weighted-phase').innerText(), 'NO ROUTE'); assert.equal(await page.locator('#weighted-cost').innerText(), '—');
    await page.click('#weighted-save'); assert.equal(await page.locator('#weighted-saved option').count(), 3);
    await page.click('#weighted-delete'); await page.click('#weighted-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#weighted-project-status').textContent.includes('Deleted the saved copy'));
    assert.equal(await page.locator('#weighted-grid [data-index]').count(), 3);

    // Huffman lazily initializes, pauses when closed, and uses the actual typed message.
    await page.click('#huffman-workshop > summary'); assert.ok(await page.evaluate(() => window.__huffmanCalls) > 0);
    await page.fill('#huffman-text', 'abcdefghijklmnop'); await page.click('#huffman-run');
    assert.equal(await page.locator('#huffman-state').innerText(), 'PLAYING'); await page.click('#huffman-workshop > summary');
    await page.waitForFunction(() => document.querySelector('#huffman-state').textContent === 'PAUSED');
    await page.click('#huffman-workshop > summary'); await page.fill('#huffman-text', 'BANANA');
    assert.equal(await page.locator('#huffman-queue .huffman-token').count(), 3);
    await page.click('#huffman-step'); assert.equal(await page.locator('#huffman-queue .huffman-token').count(), 2);
    assert.match(await page.locator('#huffman-message').innerText(), /Combine frequencies/);
    assert.match(await page.locator('#huffman-tree').getAttribute('aria-label'), /2 queue roots/);
    await page.click('#huffman-end'); assert.equal(await page.locator('#huffman-bits-count').innerText(), '9');
    assert.equal(await page.locator('#huffman-original').innerText(), '48'); assert.equal(await page.locator('#huffman-codebook tr').count(), 3);
    assert.match(await page.locator('#huffman-roundtrip').innerText(), /verified/); assert.match(await page.locator('#huffman-bits').innerText(), /^[01]{9}$/);
    await page.click('#huffman-back'); assert.equal(await page.locator('#huffman-result').isHidden(), true);
    await page.locator('#huffman-timeline').evaluate(input => { input.value = input.max; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#huffman-result').isVisible(), true);
    await page.fill('#huffman-text', '🐈🐈🐈'); await page.click('#huffman-end');
    assert.equal(await page.locator('#huffman-bits').innerText(), '000'); assert.equal(await page.locator('#huffman-original').innerText(), '96');
    await page.fill('#huffman-text', ''); await page.click('#huffman-step'); assert.match(await page.locator('#huffman-error').innerText(), /at least one/);
    await page.fill('#huffman-text', 'abcdefghijklmnopq'); await page.click('#huffman-step'); assert.match(await page.locator('#huffman-error').innerText(), /at most 16/);
    await page.fill('#huffman-text', 'AAB🐈'); await page.fill('#huffman-name', 'My message'); await page.click('#huffman-save');
    assert.match(await page.locator('#huffman-project-status').innerText(), /Saved “My message”/);
    const [textDownload] = await Promise.all([page.waitForEvent('download'), page.click('#huffman-export')]);
    const textProject = JSON.parse(fs.readFileSync(await textDownload.path(), 'utf8')); assert.equal(textProject.text, 'AAB🐈');
    await page.reload({ waitUntil: 'networkidle' }); await page.click('#huffman-workshop > summary'); await page.selectOption('#huffman-saved', 'My message'); await page.click('#huffman-load');
    assert.equal(await page.locator('#huffman-text').inputValue(), 'AAB🐈'); await page.click('#huffman-end'); assert.match(await page.locator('#huffman-roundtrip').innerText(), /verified/);
    await page.locator('#huffman-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...textProject, text: 'a\rb' })) });
    await page.waitForFunction(() => document.querySelector('#huffman-project-status').textContent.includes('LF line endings'));
    textProject.name = '<img src=x onerror=alert(1)>'; textProject.text = '<img';
    await page.locator('#huffman-file').setInputFiles({ name: 'text.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(textProject)) });
    await page.waitForFunction(() => document.querySelector('#huffman-name').value.startsWith('<img'));
    await page.click('#huffman-end'); assert.equal(await page.locator('#huffman-codebook img').count(), 0); assert.match(await page.locator('#huffman-roundtrip').innerText(), /verified/);

    // Invalid local storage is never silently overwritten; quota failures offer JSON backup.
    const hKey = 'algorithm-lab.huffman.projects.v1', original = await page.evaluate(key => localStorage.getItem(key), hKey);
    await page.evaluate(key => localStorage.setItem(key, '{broken'), hKey); await page.reload({ waitUntil: 'networkidle' }); await page.click('#huffman-workshop > summary');
    assert.match(await page.locator('#huffman-project-status').innerText(), /unavailable or unreadable/);
    await page.fill('#huffman-name', 'Do not overwrite'); await page.click('#huffman-save'); assert.equal(await page.evaluate(key => localStorage.getItem(key), hKey), '{broken');
    await page.evaluate(({ hKey, original }) => localStorage.setItem(hKey, original), { hKey, original }); await page.reload({ waitUntil: 'networkidle' }); await page.click('#huffman-workshop > summary');
    await page.evaluate(key => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('Full', 'QuotaExceededError'); return set.call(this, k, v); }; }, hKey);
    await page.fill('#huffman-name', 'Quota test'); await page.click('#huffman-save'); assert.match(await page.locator('#huffman-project-status').innerText(), /blocked or full/);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), hKey), original);
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth })); assert.ok(layout.scroll <= layout.width, `page overflowed horizontally: ${JSON.stringify(layout)}`);
    if (mobile) {
      const controls = await page.locator('#weighted-run, #weighted-step, #weighted-save, #weighted-grid button, #huffman-run, #huffman-step, #huffman-save, #huffman-text, .weighted-tools label').evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { label: element.id || element.textContent.trim(), width: rect.width, height: rect.height }; }));
      assert.ok(controls.every(rect => rect.width >= 44 && rect.height >= 44), `touch targets: ${JSON.stringify(controls)}`);
    }
    // In-page confirmations work even when a host iframe disallows native dialogs or storage.
    await page.evaluate(url => { const frame = document.createElement('iframe'); frame.id = 'more-embedded-test'; frame.sandbox = 'allow-scripts'; frame.src = url; frame.style.cssText = 'width:100%;height:900px;border:0'; document.body.append(frame); }, base + '/');
    const embedded = page.frameLocator('#more-embedded-test'); await embedded.locator('#weighted-name').fill('Frame draft'); await embedded.locator('#weighted-new').click();
    assert.match(await embedded.locator('#weighted-confirm-message').innerText(), /unsaved changes/i); await embedded.locator('#weighted-confirm-cancel').click();
    assert.equal(await embedded.locator('#weighted-name').inputValue(), 'Frame draft');
    await embedded.locator('#weighted-new').click(); await embedded.locator('#weighted-confirm-accept').click();
    const child = await (await page.locator('#more-embedded-test').elementHandle()).contentFrame();
    await child.waitForFunction(() => document.querySelector('#weighted-name').value === 'The costly shortcut');

    // Self-contained offline file: run, save and exchange both types without network requests.
    await context.setOffline(true); offline = true; await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href, { waitUntil: 'load' });
    await page.click('#weighted-end'); assert.equal(await page.locator('#weighted-cost').innerText(), '9');
    await page.fill('#weighted-name', 'Offline map'); await page.click('#weighted-save');
    await page.reload({ waitUntil: 'load' }); await page.selectOption('#weighted-saved', 'Offline map'); await page.click('#weighted-load'); await page.click('#weighted-end');
    assert.equal(await page.locator('#weighted-cost').innerText(), '9');
    const [offlineMapDownload] = await Promise.all([page.waitForEvent('download'), page.click('#weighted-export')]);
    const offlineMap = JSON.parse(fs.readFileSync(await offlineMapDownload.path(), 'utf8')); assert.equal(offlineMap.name, 'Offline map');
    offlineMap.name = 'Offline blocked'; offlineMap.cols = 3; offlineMap.rows = 1; offlineMap.costs = [1, 0, 1]; offlineMap.start = 0; offlineMap.goal = 2;
    await page.locator('#weighted-file').setInputFiles({ name: 'offline-map.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(offlineMap)) });
    await page.waitForFunction(() => document.querySelector('#weighted-name').value === 'Offline blocked'); await page.click('#weighted-end');
    assert.equal(await page.locator('#weighted-phase').innerText(), 'NO ROUTE');
    await page.click('#huffman-workshop > summary'); await page.fill('#huffman-text', 'BANANA'); await page.click('#huffman-end');
    assert.equal(await page.locator('#huffman-bits-count').innerText(), '9'); await page.fill('#huffman-name', 'Offline text'); await page.click('#huffman-save');
    const [offlineTextDownload] = await Promise.all([page.waitForEvent('download'), page.click('#huffman-export')]);
    const offlineText = JSON.parse(fs.readFileSync(await offlineTextDownload.path(), 'utf8')); assert.equal(offlineText.text, 'BANANA');
    offlineText.name = 'Offline imported'; offlineText.text = '🐈🐈';
    await page.locator('#huffman-file').setInputFiles({ name: 'offline-text.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(offlineText)) });
    await page.waitForFunction(() => document.querySelector('#huffman-name').value === 'Offline imported'); await page.click('#huffman-end');
    assert.equal(await page.locator('#huffman-bits').innerText(), '00'); assert.deepEqual(offlineRequests, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(`PASS: weighted search and Huffman creation, playback, persistence, safeguards and offline use at ${width}px`);
    await context.close();
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(problem => { console.error(problem); process.exitCode = 1; });
