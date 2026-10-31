/* Optional browser regression for creation, projects and offline execution. */
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
  const file = path.resolve(root, `.${new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => error ? res.writeHead(404).end() : res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(content));
});
const code = '# A user-made transformation\nset sum = 0\nfor i = 0 to n - 1\n  if a[i] < 0\n    write i, a[i] * 2\n  end\n  set sum = sum + a[i]\nend\nreturn sum';
const cases = JSON.stringify([{ input: [-2, 5, -1], expect: [-4, 5, -2] }, { input: [-2, 5, -1], expect: -1 }], null, 2);

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
    browser = await chromium.launch({ headless: true, args, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'no-preference', acceptDownloads: true });
    const page = await context.newPage(), errors = [], external = [], offlineRequests = [], dialogs = [];
    let offline = false, acceptDialogs = true;
    page.on('pageerror', problem => errors.push(problem.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('dialog', dialog => { dialogs.push(dialog.message()); return acceptDialogs ? dialog.accept() : dialog.dismiss(); });
    page.on('request', request => {
      const url = request.url();
      if (offline && !/^(file:|data:|blob:)/.test(url)) offlineRequests.push(url);
      if (!url.startsWith(base + '/') && !/^(file:|data:|blob:)/.test(url)) external.push(url);
    });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#studio-code').inputValue(), await page.evaluate(() => AlgorithmStudio.STARTERS.bubble.code));
    assert.equal(await page.locator('#studio-bars .studio-bar-column').count(), 7);
    await page.click('#studio-new');
    assert.equal(await page.locator('#studio-name').inputValue(), 'Untitled algorithm');
    assert.equal(await page.locator('#studio-values').inputValue(), '');
    await page.fill('#studio-name', 'Negative doubler');
    await page.fill('#studio-values', '-2, 5, -1');
    await page.fill('#studio-code', code);
    await page.click('#studio-tests-panel summary');
    await page.fill('#studio-tests', '[]');
    await page.fill('#studio-case-input', '-2, 5, -1'); await page.fill('#studio-case-expect', '-4, 5, -2');
    await page.click('#studio-add-case');
    await page.selectOption('#studio-case-kind', 'return'); await page.fill('#studio-case-expect', '-1'); await page.click('#studio-add-case');
    assert.deepEqual(JSON.parse(await page.locator('#studio-tests').inputValue()), JSON.parse(cases));
    await page.fill('#studio-case-expect', '1, 2'); await page.click('#studio-add-case');
    assert.match(await page.locator('#studio-case-status').innerText(), /one whole number/);
    assert.deepEqual(JSON.parse(await page.locator('#studio-tests').inputValue()), JSON.parse(cases));
    assert.equal(await page.locator('#studio-draft').innerText(), 'UNSAVED CHANGES');
    await page.click('#studio-step');
    assert.match(await page.locator('#studio-position').innerText(), /^1 \/ \d+$/);
    assert.equal(await page.locator('#studio-current-code').innerText(), 'set sum = 0');
    await page.click('#studio-back'); assert.match(await page.locator('#studio-position').innerText(), /^0 \/ /);
    await page.click('#studio-end');
    assert.deepEqual(await page.locator('#studio-bars .studio-bar-value').allTextContents(), ['-4', '5', '-2']);
    assert.equal(await page.locator('#studio-return').innerText(), '-1');
    assert.equal(await page.locator('#studio-run-state').innerText(), 'FINISHED');
    assert.match(await page.locator('#studio-bars').getAttribute('aria-label'), /index 0, -4/);
    await page.click('#studio-reset'); await page.click('#studio-run');
    assert.equal(await page.locator('#studio-run-state').innerText(), 'PLAYING');
    await page.click('#studio-run'); assert.equal(await page.locator('#studio-run-state').innerText(), 'PAUSED');
    await page.click('#studio-end'); assert.equal(await page.locator('#studio-run-state').innerText(), 'FINISHED');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.click('#studio-reset'); await page.click('#studio-run');
    assert.equal(await page.locator('#studio-run-state').innerText(), 'FINISHED', 'reduced motion should skip animation');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await page.click('#studio-run-tests');
    assert.match(await page.locator('#studio-test-results').innerText(), /2 of 2 tests passed/);
    await page.fill('#studio-tests', '[{"input":[1],"expect":[7]}]'); await page.click('#studio-run-tests');
    assert.match(await page.locator('#studio-test-results').innerText(), /0 of 1 tests passed/);
    assert.match(await page.locator('#studio-test-results').innerText(), /expected \[7\] · got \[1\]/);
    await page.fill('#studio-tests', cases);

    await page.click('.studio-pieces-detail summary');
    await page.click('#studio-add-value'); assert.equal(await page.locator('#studio-values').inputValue(), '-2, 5, -1, 0');
    assert.equal(await page.locator('#studio-position').innerText(), '0 / 0', 'data edits invalidate old playback');
    await page.fill('#studio-piece-3', '8'); await page.locator('#studio-piece-3').blur();
    assert.equal(await page.locator('#studio-values').inputValue(), '-2, 5, -1, 8');
    await page.click('[aria-label="Move value at index 3 left"]');
    assert.equal(await page.locator('#studio-values').inputValue(), '-2, 5, 8, -1');
    await page.click('[aria-label="Remove value at index 2"]');
    assert.equal(await page.locator('#studio-values').inputValue(), '-2, 5, -1');
    assert.equal(await page.locator('#studio-code').inputValue(), code, 'building data must keep the authored program');

    // Snippets are editable insertions, not locked preset steps.
    await page.locator('#studio-code').focus(); await page.keyboard.press('Control+End');
    await page.click('[data-studio-insert="set"]');
    assert.match(await page.locator('#studio-code').inputValue(), /set total = 0$/);
    await page.fill('#studio-code', code);
    await page.selectOption('#studio-starter', 'reverse'); await page.click('#studio-use-starter');
    assert.match(await page.locator('#studio-confirm-message').innerText(), /program and test cases/);
    await page.click('#studio-confirm-cancel'); assert.equal(await page.locator('#studio-code').inputValue(), code);
    await page.click('#studio-use-starter'); await page.click('#studio-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#studio-code').value.includes('Exchange the ends'));
    assert.equal(await page.locator('#studio-values').inputValue(), '-2, 5, -1');
    await page.fill('#studio-code', code); await page.fill('#studio-tests', cases);
    await page.click('#studio-save'); assert.match(await page.locator('#studio-project-status').innerText(), /Saved “Negative doubler”/);
    assert.equal(await page.locator('#studio-draft').innerText(), 'SAVED LOCALLY');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('algorithm-lab.studio.projects.v1')));
    assert.equal(stored.length, 1); assert.equal(stored[0].code, code);
    await page.reload({ waitUntil: 'networkidle' });
    await page.selectOption('#studio-saved', 'Negative doubler'); await page.click('#studio-load');
    assert.equal(await page.locator('#studio-code').inputValue(), code);
    assert.equal(await page.locator('#studio-values').inputValue(), '-2, 5, -1');
    await page.click('#studio-end'); assert.equal(await page.locator('#studio-return').innerText(), '-1');
    await page.fill('#studio-code', code + '\n# an unsaved edit');
    const beforeConflict = await page.evaluate(() => localStorage.getItem('algorithm-lab.studio.projects.v1'));
    await page.evaluate(() => {
      const key = 'algorithm-lab.studio.projects.v1', projects = JSON.parse(localStorage.getItem(key));
      projects[0].code += '\n# another tab, first edit'; localStorage.setItem(key, JSON.stringify(projects));
    });
    await page.click('#studio-save'); assert.match(await page.locator('#studio-confirm-message').innerText(), /Replace the saved project/);
    await page.evaluate(() => {
      const key = 'algorithm-lab.studio.projects.v1', projects = JSON.parse(localStorage.getItem(key));
      projects[0].code += '\n# another tab, second edit'; localStorage.setItem(key, JSON.stringify(projects));
    });
    await page.click('#studio-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#studio-project-status').textContent.includes('changed in another tab'));
    assert.match(await page.evaluate(() => JSON.parse(localStorage.getItem('algorithm-lab.studio.projects.v1'))[0].code), /second edit/);
    await page.evaluate(raw => localStorage.setItem('algorithm-lab.studio.projects.v1', raw), beforeConflict);
    await page.click('#studio-new');
    assert.match(await page.locator('#studio-confirm-message').innerText(), /unsaved changes/i);
    await page.click('#studio-confirm-cancel');
    assert.match(await page.locator('#studio-code').inputValue(), /unsaved edit/);
    await page.click('#studio-new'); await page.click('#studio-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#studio-code').value.includes('Build your own'));
    assert.match(await page.locator('#studio-code').inputValue(), /Build your own/);

    await page.selectOption('#studio-saved', 'Negative doubler'); await page.click('#studio-load');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#studio-export')]);
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.name, 'Negative doubler'); assert.equal(exported.code, code);
    await page.locator('#studio-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
    await page.waitForFunction(() => document.querySelector('#studio-project-status').textContent.includes('not a supported'));
    assert.match(await page.locator('#studio-project-status').innerText(), /not a supported/);
    assert.equal(await page.locator('#studio-code').inputValue(), code, 'invalid import must not replace the draft');
    exported.name = 'Imported <img src=x onerror=alert(1)>';
    await page.locator('#studio-file').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.waitForFunction(() => document.querySelector('#studio-name').value.startsWith('Imported'));
    assert.equal(await page.locator('#studio-name').inputValue(), exported.name);
    await page.click('#studio-save'); assert.equal(await page.locator('#studio-saved option').count(), 3);
    assert.equal(await page.locator('#studio-saved img').count(), 0, 'project names are text, not HTML');
    await page.click('#studio-delete'); assert.match(await page.locator('#studio-confirm-message').innerText(), /open draft will stay/);
    await page.click('#studio-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#studio-project-status').textContent.includes('Deleted the saved copy'));
    assert.equal(await page.locator('#studio-code').inputValue(), code); assert.equal(await page.locator('#studio-draft').innerText(), 'UNSAVED CHANGES');
    assert.equal(await page.locator('#studio-saved option').count(), 2);

    // Even unfinished text can be preserved as a project; validity is checked on run.
    await page.fill('#studio-name', 'Incomplete draft'); await page.fill('#studio-values', '1,');
    await page.fill('#studio-code', 'while true'); await page.click('#studio-tests-panel summary'); await page.fill('#studio-tests', '['); await page.click('#studio-save');
    await page.reload({ waitUntil: 'networkidle' }); await page.selectOption('#studio-saved', 'Incomplete draft'); await page.click('#studio-load');
    assert.equal(await page.locator('#studio-values').inputValue(), '1,'); assert.equal(await page.locator('#studio-code').inputValue(), 'while true');
    await page.click('#studio-step'); assert.match(await page.locator('#studio-error').innerText(), /whole numbers/);
    // Valid-sized Unicode drafts can occupy more than 50 KB when encoded as JSON.
    const unicodeCode = '#' + '界'.repeat(11000), unicodeTests = '界'.repeat(11000);
    await page.fill('#studio-name', 'Unicode draft'); await page.fill('#studio-code', unicodeCode);
    await page.click('#studio-tests-panel summary'); await page.fill('#studio-tests', unicodeTests);
    const [largeDownload] = await Promise.all([page.waitForEvent('download'), page.click('#studio-export')]);
    const largeProject = fs.readFileSync(await largeDownload.path()); assert.ok(largeProject.length > 50000);
    await page.fill('#studio-code', 'temporary change');
    await page.locator('#studio-file').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: largeProject });
    await page.locator('#studio-confirm').waitFor({ state: 'visible' }); await page.click('#studio-confirm-accept');
    await page.waitForFunction(() => document.querySelector('#studio-code').value.length === 11001);
    assert.equal(await page.locator('#studio-code').inputValue(), unicodeCode); assert.equal(await page.locator('#studio-tests').inputValue(), unicodeTests);
    await page.fill('#studio-values', '1'); await page.fill('#studio-code', 'while true\nend'); await page.click('#studio-step');
    assert.match(await page.locator('#studio-error').innerText(), /Stopped after 3000 steps/);
    await page.fill('#studio-values', Array(25).fill('1').join(',')); await page.fill('#studio-code', 'return n'); await page.click('#studio-step');
    assert.match(await page.locator('#studio-error').innerText(), /at most 24/);
    const dialogCount = dialogs.length;
    await page.fill('#studio-values', '1'); await page.fill('#studio-code', 'set x = window.alert(1)'); await page.click('#studio-step');
    assert.match(await page.locator('#studio-error').innerText(), /Unexpected character/);
    assert.equal(dialogs.length, dialogCount, 'user programs must not execute as JavaScript');

    // Broken or quota-limited browser storage must never silently overwrite saved work.
    const savedRaw = await page.evaluate(() => localStorage.getItem('algorithm-lab.studio.projects.v1'));
    await page.evaluate(() => localStorage.setItem('algorithm-lab.studio.projects.v1', '{broken'));
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(await page.locator('#studio-project-status').innerText(), /unavailable or unreadable/);
    await page.fill('#studio-name', 'Do not overwrite'); await page.click('#studio-save');
    assert.equal(await page.evaluate(() => localStorage.getItem('algorithm-lab.studio.projects.v1')), '{broken');
    await page.evaluate(value => localStorage.setItem('algorithm-lab.studio.projects.v1', value), savedRaw);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'algorithm-lab.studio.projects.v1') throw new DOMException('Full', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await page.fill('#studio-name', 'Quota test'); await page.click('#studio-save');
    assert.match(await page.locator('#studio-project-status').innerText(), /blocked or full/);
    assert.equal(await page.evaluate(() => localStorage.getItem('algorithm-lab.studio.projects.v1')), savedRaw);

    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(layout.scroll <= layout.width, `page overflowed horizontally: ${JSON.stringify(layout)}`);
    if (mobile) {
      await page.click('.studio-pieces-detail summary'); await page.click('#studio-tests-panel summary');
      const controls = await page.locator('#studio-run, #studio-step, #studio-end, #studio-save, #studio-add-value, #studio-add-case, #studio-case-input, #studio-case-expect, [data-studio-insert="if"], .studio-piece-actions button').evaluateAll(items => items.map(item => {
        const rect = item.getBoundingClientRect(); return { id: item.id || item.getAttribute('aria-label') || item.dataset.studioInsert, width: rect.width, height: rect.height };
      }));
      assert.ok(controls.every(rect => rect.width >= 44 && rect.height >= 44), `touch controls should be at least 44px: ${JSON.stringify(controls)}`);
      const starterFits = await page.locator('#studio-starter').evaluate(select => {
        const style = getComputedStyle(select), canvas = document.createElement('canvas').getContext('2d');
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 18;
        return [...select.options].every(option => canvas.measureText(option.textContent).width <= available);
      });
      assert.ok(starterFits, 'starter labels should fit on narrow touch screens');
      const caseKindFits = await page.locator('#studio-case-kind').evaluate(select => {
        const style = getComputedStyle(select), canvas = document.createElement('canvas').getContext('2d');
        canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 18;
        return [...select.options].every(option => canvas.measureText(option.textContent).width <= available);
      });
      assert.ok(caseKindFits, 'test result type labels should fit on narrow touch screens');
    }

    // Embedded previews may disallow native modal dialogs. The in-page guard still works.
    await page.evaluate(url => {
      const frame = document.createElement('iframe'); frame.id = 'studio-embedded-test'; frame.sandbox = 'allow-scripts';
      frame.src = url; frame.style.cssText = 'width:100%;height:900px;border:0'; document.body.append(frame);
    }, base + '/');
    const embedded = page.frameLocator('#studio-embedded-test');
    await embedded.locator('#studio-name').fill('Frame draft'); await embedded.locator('#studio-new').click();
    assert.match(await embedded.locator('#studio-confirm-message').innerText(), /unsaved changes/i);
    await embedded.locator('#studio-confirm-cancel').click();
    assert.equal(await embedded.locator('#studio-name').inputValue(), 'Frame draft');
    await embedded.locator('#studio-new').click(); await embedded.locator('#studio-confirm-accept').click();
    const child = await (await page.locator('#studio-embedded-test').elementHandle()).contentFrame();
    await child.waitForFunction(() => document.querySelector('#studio-name').value === 'Untitled algorithm');
    await child.evaluate(() => document.fonts.ready);

    // True offline file mode exercises a freshly built self-contained version.
    acceptDialogs = true; await context.setOffline(true); offline = true;
    await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href, { waitUntil: 'load' });
    await page.fill('#studio-values', '-2, 5, -1'); await page.fill('#studio-code', code);
    await page.click('#studio-end'); assert.equal(await page.locator('#studio-return').innerText(), '-1');
    assert.deepEqual(await page.locator('#studio-bars .studio-bar-value').allTextContents(), ['-4', '5', '-2']);
    await page.click('#studio-tests-panel summary'); await page.fill('#studio-tests', cases); await page.click('#studio-run-tests');
    assert.match(await page.locator('#studio-test-results').innerText(), /2 of 2 tests passed/);
    await page.fill('#studio-name', 'Offline creation'); await page.click('#studio-save');
    assert.match(await page.locator('#studio-project-status').innerText(), /Saved “Offline creation”/);
    await page.reload({ waitUntil: 'load' }); await page.selectOption('#studio-saved', 'Offline creation'); await page.click('#studio-load');
    assert.equal(await page.locator('#studio-code').inputValue(), code); await page.click('#studio-end');
    assert.equal(await page.locator('#studio-return').innerText(), '-1');
    const [offlineDownload] = await Promise.all([page.waitForEvent('download'), page.click('#studio-export')]);
    assert.equal(JSON.parse(fs.readFileSync(await offlineDownload.path(), 'utf8')).name, 'Offline creation');
    assert.deepEqual(offlineRequests, [], 'standalone must not request network resources');
    assert.deepEqual(external, [], 'app must not request external resources');
    assert.deepEqual(errors, [], 'browser console should be clean');
    console.log(`PASS: creation, tests, projects, safety and offline studio at ${width}px`);
    await context.close();
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(problem => { console.error(problem); process.exitCode = 1; });
