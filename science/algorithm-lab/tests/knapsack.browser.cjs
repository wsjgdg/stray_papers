/* Optional browser checks for dynamic programming, user scenarios and offline parity. */
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
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
    browser = await chromium.launch({ headless: true, args, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference', acceptDownloads: true });
    const page = await context.newPage(), errors = [], external = [], offlineRequests = [];
    let offline = false;
    page.on('pageerror', problem => errors.push(problem.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('dialog', dialog => dialog.accept());
    page.on('request', request => {
      const url = request.url();
      if (offline && !/^(file:|data:|blob:)/.test(url)) offlineRequests.push(url);
      if (!url.startsWith(base + '/') && !/^(file:|data:|blob:)/.test(url)) external.push(url);
    });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#knapsack-item-name-0').inputValue(), 'Camera');
    assert.equal(await page.locator('#knapsack-table-body tr').count(), 4);
    assert.equal(await page.locator('#knapsack-table-body td[data-row="1"][data-capacity="1"]').innerText(), '·');
    await page.click('#knapsack-step');
    assert.equal(await page.locator('#knapsack-position').innerText(), '1 / 34');
    assert.equal(await page.locator('#knapsack-table-body td[data-row="1"][data-capacity="1"]').innerText(), '0');
    assert.match(await page.locator('#knapsack-formula').innerText(), /unavailable/);
    await page.locator('#knapsack-timeline').evaluate(input => { input.value = '6'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#knapsack-table-body td.is-current').getAttribute('data-capacity'), '6');
    assert.equal(await page.locator('#knapsack-table-body td.is-current').innerText(), '30');
    assert.equal(await page.locator('#knapsack-table-body td.is-dependency').count(), 2);
    assert.match(await page.locator('#knapsack-formula').innerText(), /take = 30 \+ 0 = 30/);
    await page.click('#knapsack-end');
    assert.equal(await page.locator('#knapsack-optimum').innerText(), '48'); assert.equal(await page.locator('#knapsack-weight').innerText(), '10 / 10');
    assert.match(await page.locator('#knapsack-selection').innerText(), /Laptop · Tent/);
    assert.equal(await page.locator('#knapsack-table-body td[data-row="3"][data-capacity="10"]').innerText(), '48');
    await page.click('#knapsack-back'); assert.equal(await page.locator('#knapsack-phase').innerText(), 'TRACING BACK');
    await page.click('#knapsack-reset'); await page.click('#knapsack-run'); assert.equal(await page.locator('#knapsack-run-state').innerText(), 'PLAYING');
    await page.click('#knapsack-run'); assert.equal(await page.locator('#knapsack-run-state').innerText(), 'PAUSED');
    await page.click('#knapsack-end');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.click('#knapsack-reset'); await page.click('#knapsack-run');
    assert.equal(await page.locator('#knapsack-run-state').innerText(), 'FINISHED'); await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Build a new problem and check the solver actually uses those inputs.
    await page.fill('#knapsack-name', 'Custom pack'); await page.fill('#knapsack-capacity', '7');
    for (const [i, name, weight, value] of [[0, 'A', '2', '3'], [1, 'B', '3', '4'], [2, 'C', '4', '5']]) {
      await page.fill(`#knapsack-item-name-${i}`, name); await page.fill(`#knapsack-item-weight-${i}`, weight); await page.fill(`#knapsack-item-value-${i}`, value);
    }
    await page.click('#knapsack-add'); await page.fill('#knapsack-item-name-3', 'D'); await page.fill('#knapsack-item-weight-3', '5'); await page.fill('#knapsack-item-value-3', '8');
    assert.equal(await page.locator('#knapsack-position').innerText(), '0 / 0', 'editing invalidates old playback');
    await page.click('#knapsack-end'); assert.equal(await page.locator('#knapsack-optimum').innerText(), '11');
    assert.match(await page.locator('#knapsack-selection').innerText(), /A · D/);
    await page.click('[aria-label="Move item 4 up"]');
    assert.equal(await page.locator('#knapsack-item-name-2').inputValue(), 'D'); await page.click('[aria-label="Remove item 2"]');
    await page.click('#knapsack-end'); assert.equal(await page.locator('#knapsack-optimum').innerText(), '11');
    assert.match(await page.locator('#knapsack-selection').innerText(), /A · D/);
    assert.equal(await page.locator('#knapsack-draft').innerText(), 'UNSAVED CHANGES');
    await page.click('#knapsack-save'); assert.match(await page.locator('#knapsack-project-status').innerText(), /Saved “Custom pack”/);
    await page.reload({ waitUntil: 'networkidle' }); await page.selectOption('#knapsack-saved', 'Custom pack'); await page.click('#knapsack-load');
    assert.equal(await page.locator('#knapsack-capacity').inputValue(), '7'); assert.equal(await page.locator('#knapsack-item-name-1').inputValue(), 'D');
    await page.click('#knapsack-end'); assert.equal(await page.locator('#knapsack-optimum').innerText(), '11');
    await page.fill('#knapsack-capacity', '8');
    const beforeConflict = await page.evaluate(() => localStorage.getItem('algorithm-lab.knapsack.scenarios.v1'));
    await page.evaluate(() => {
      const key = 'algorithm-lab.knapsack.scenarios.v1', records = JSON.parse(localStorage.getItem(key));
      records[0].capacity = '9'; localStorage.setItem(key, JSON.stringify(records));
    });
    await page.click('#knapsack-save'); assert.match(await page.locator('#knapsack-confirm-message').innerText(), /Replace the saved scenario/);
    await page.evaluate(() => {
      const key = 'algorithm-lab.knapsack.scenarios.v1', records = JSON.parse(localStorage.getItem(key));
      records[0].capacity = '10'; localStorage.setItem(key, JSON.stringify(records));
    });
    await page.click('#knapsack-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#knapsack-project-status').textContent.includes('changed in another tab'));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('algorithm-lab.knapsack.scenarios.v1'))[0].capacity), '10');
    assert.equal(await page.locator('#knapsack-capacity').inputValue(), '8');
    await page.evaluate(raw => localStorage.setItem('algorithm-lab.knapsack.scenarios.v1', raw), beforeConflict); await page.fill('#knapsack-capacity', '7');

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#knapsack-export')]);
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8')); assert.equal(exported.name, 'Custom pack'); assert.equal(exported.items.length, 3);
    await page.locator('#knapsack-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
    await page.waitForFunction(() => document.querySelector('#knapsack-project-status').textContent.includes('not a supported'));
    assert.equal(await page.locator('#knapsack-item-name-1').inputValue(), 'D');
    exported.name = 'Imported <img src=x onerror=alert(1)>'; exported.items[0].name = '<img src=x>';
    await page.locator('#knapsack-file').setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.waitForFunction(() => document.querySelector('#knapsack-name').value.startsWith('Imported'));
    assert.equal(await page.locator('#knapsack-item-name-0').inputValue(), '<img src=x>'); assert.equal(await page.locator('#knapsack-table img').count(), 0);
    await page.click('#knapsack-save'); assert.equal(await page.locator('#knapsack-saved option').count(), 3);
    await page.click('#knapsack-delete'); assert.match(await page.locator('#knapsack-confirm-message').innerText(), /open draft will stay/);
    await page.click('#knapsack-confirm-accept'); await page.waitForFunction(() => document.querySelector('#knapsack-project-status').textContent.includes('Deleted the saved copy'));
    assert.equal(await page.locator('#knapsack-item-name-0').inputValue(), '<img src=x>');
    await page.click('#knapsack-new'); assert.match(await page.locator('#knapsack-confirm-message').innerText(), /unsaved changes/i);
    await page.click('#knapsack-confirm-cancel'); assert.equal(await page.locator('#knapsack-item-name-0').inputValue(), '<img src=x>');
    await page.click('#knapsack-new'); await page.click('#knapsack-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#knapsack-name').value === 'Untitled scenario');
    await page.fill('#knapsack-capacity', '0'); await page.click('#knapsack-end');
    assert.equal(await page.locator('#knapsack-optimum').innerText(), '0'); assert.equal(await page.locator('#knapsack-selection').innerText(), 'Selected items: none.');
    await page.click('#knapsack-add'); await page.fill('#knapsack-item-name-0', 'Draft'); await page.fill('#knapsack-item-weight-0', 'abc');
    await page.fill('#knapsack-item-value-0', ''); await page.fill('#knapsack-capacity', ''); await page.fill('#knapsack-name', 'Incomplete'); await page.click('#knapsack-save');
    await page.reload({ waitUntil: 'networkidle' }); await page.selectOption('#knapsack-saved', 'Incomplete'); await page.click('#knapsack-load');
    assert.equal(await page.locator('#knapsack-item-weight-0').inputValue(), 'abc'); assert.equal(await page.locator('#knapsack-capacity').inputValue(), '');
    await page.click('#knapsack-step'); assert.match(await page.locator('#knapsack-error').innerText(), /Capacity must/);
    await page.fill('#knapsack-capacity', '2'); await page.click('#knapsack-step'); assert.match(await page.locator('#knapsack-error').innerText(), /Item 1 weight/);
    await page.fill('#knapsack-item-weight-0', '1'); await page.fill('#knapsack-item-value-0', '100'); await page.click('#knapsack-step');
    assert.match(await page.locator('#knapsack-error').innerText(), /Item 1 value/);
    await page.fill('#knapsack-item-value-0', '3');
    for (let i = 1; i < 8; i++) await page.click('#knapsack-add');
    assert.equal(await page.locator('.knapsack-item').count(), 8); assert.equal(await page.locator('#knapsack-add').isDisabled(), true);
    await page.click('#knapsack-end'); assert.ok(Number(await page.locator('#knapsack-optimum').innerText()) > 0);

    // A bad storage record is never silently replaced.
    const originalStorage = await page.evaluate(() => localStorage.getItem('algorithm-lab.knapsack.scenarios.v1'));
    await page.evaluate(() => localStorage.setItem('algorithm-lab.knapsack.scenarios.v1', '{broken'));
    await page.reload({ waitUntil: 'networkidle' }); assert.match(await page.locator('#knapsack-project-status').innerText(), /unavailable or unreadable/);
    await page.fill('#knapsack-name', 'Do not overwrite'); await page.click('#knapsack-save');
    assert.equal(await page.evaluate(() => localStorage.getItem('algorithm-lab.knapsack.scenarios.v1')), '{broken');
    await page.evaluate(raw => localStorage.setItem('algorithm-lab.knapsack.scenarios.v1', raw), originalStorage);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'algorithm-lab.knapsack.scenarios.v1') throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.fill('#knapsack-name', 'Quota test'); await page.click('#knapsack-save');
    assert.match(await page.locator('#knapsack-project-status').innerText(), /blocked or full/);
    assert.equal(await page.evaluate(() => localStorage.getItem('algorithm-lab.knapsack.scenarios.v1')), originalStorage);

    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(layout.scroll <= layout.width, `page overflowed horizontally: ${JSON.stringify(layout)}`);
    if (mobile) {
      const controls = await page.locator('#knapsack-run, #knapsack-step, #knapsack-save, #knapsack-add, #knapsack-capacity, .knapsack-item input, .knapsack-item button').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect(); return { label: element.id || element.getAttribute('aria-label'), width: rect.width, height: rect.height };
      }));
      assert.ok(controls.every(rect => rect.width >= 44 && rect.height >= 44), `touch targets: ${JSON.stringify(controls)}`);
    }

    // In-page confirmations work in an iframe that disallows native modals.
    await page.evaluate(url => { const frame = document.createElement('iframe'); frame.id = 'knapsack-embedded-test'; frame.sandbox = 'allow-scripts'; frame.src = url; frame.style.cssText = 'width:100%;height:900px;border:0'; document.body.append(frame); }, base + '/');
    const embedded = page.frameLocator('#knapsack-embedded-test');
    await embedded.locator('#knapsack-name').fill('Frame draft'); await embedded.locator('#knapsack-new').click();
    assert.match(await embedded.locator('#knapsack-confirm-message').innerText(), /unsaved changes/i);
    await embedded.locator('#knapsack-confirm-cancel').click(); assert.equal(await embedded.locator('#knapsack-name').inputValue(), 'Frame draft');
    await embedded.locator('#knapsack-new').click(); await embedded.locator('#knapsack-confirm-accept').click();
    const child = await (await page.locator('#knapsack-embedded-test').elementHandle()).contentFrame();
    await child.waitForFunction(() => document.querySelector('#knapsack-name').value === 'Untitled scenario'); await child.evaluate(() => document.fonts.ready);

    // Both new algorithms must work in the actual self-contained offline file.
    await context.setOffline(true); offline = true;
    await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href, { waitUntil: 'load' });
    await page.click('#knapsack-end'); assert.equal(await page.locator('#knapsack-optimum').innerText(), '48');
    await page.fill('#knapsack-name', 'Offline pack'); await page.click('#knapsack-save');
    await page.reload({ waitUntil: 'load' }); await page.selectOption('#knapsack-saved', 'Offline pack'); await page.click('#knapsack-load');
    await page.click('#knapsack-end'); assert.equal(await page.locator('#knapsack-optimum').innerText(), '48');
    const [offlineDownload] = await Promise.all([page.waitForEvent('download'), page.click('#knapsack-export')]);
    const offlineProject = JSON.parse(fs.readFileSync(await offlineDownload.path(), 'utf8')); assert.equal(offlineProject.name, 'Offline pack');
    offlineProject.name = 'Offline imported'; offlineProject.capacity = '7';
    await page.locator('#knapsack-file').setInputFiles({ name: 'offline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(offlineProject)) });
    await page.waitForFunction(() => document.querySelector('#knapsack-name').value === 'Offline imported');
    await page.click('#knapsack-end'); assert.equal(await page.locator('#knapsack-optimum').innerText(), '30');
    await page.selectOption('#studio-starter', 'heap'); await page.click('#studio-use-starter');
    await page.fill('#studio-values', '5, -1, 4, 2, 5'); await page.click('#studio-end');
    assert.deepEqual(await page.locator('#studio-bars .studio-bar-value').allTextContents(), ['-1', '2', '4', '5', '5']);
    await page.click('#studio-tests-panel summary'); await page.click('#studio-run-tests'); assert.match(await page.locator('#studio-test-results').innerText(), /3 of 3 tests passed/);
    assert.deepEqual(offlineRequests, []); assert.deepEqual(external, []); assert.deepEqual(errors, []);
    console.log(`PASS: knapsack creation, trace, persistence, safeguards and offline algorithms at ${width}px`);
    await context.close();
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(problem => { console.error(problem); process.exitCode = 1; });
