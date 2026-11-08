/* Optional Playwright regression checks; the app itself has no runtime dependencies. */
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const width = Number(process.argv[2] || 1440), mobile = width <= 520;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, content) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }).end(content);
  });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
    browser = await chromium.launch({ headless: true, args, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], external = [], offlineRequests = [];
    let offline = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', request => {
      const url = request.url();
      if (offline && !/^(file:|data:)/.test(url)) offlineRequests.push(url);
      if (!url.startsWith(base + '/') && !/^(file:|data:)/.test(url)) external.push(url);
    });
    await page.addInitScript(() => {
      window.__frontendStats = { sortComparisons: 0, pathComparisons: 0, pathTraces: 0, binaryTraces: 0, recursionTraces: 0, backgrounds: 0, canvasMeasures: 0, complexityMutations: 0 };
      let models;
      Object.defineProperty(window, 'AlgorithmModels', {
        configurable: true, get() { return models; }, set(api) {
          models = api;
          for (const [name, counter] of [['compareSorts', 'sortComparisons'], ['comparePaths', 'pathComparisons'], ['pathTrace', 'pathTraces'], ['binaryTrace', 'binaryTraces'], ['factorialTrace', 'recursionTraces']]) {
            const original = api[name];
            api[name] = function (...args) { window.__frontendStats[counter]++; return original.apply(this, args); };
          }
        }
      });
      const gradient = CanvasRenderingContext2D.prototype.createRadialGradient;
      CanvasRenderingContext2D.prototype.createRadialGradient = function (...args) { window.__frontendStats.backgrounds++; return gradient.apply(this, args); };
      const measure = HTMLCanvasElement.prototype.getBoundingClientRect;
      HTMLCanvasElement.prototype.getBoundingClientRect = function (...args) {
        if (this.id === 'experiment-canvas') window.__frontendStats.canvasMeasures++;
        return measure.apply(this, args);
      };
    });
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(100); // Settle initial resize and font redraws.
    const stats = () => page.evaluate(() => ({ ...window.__frontendStats }));
    let before = await stats();
    assert.equal(before.sortComparisons, 0, 'closed sorting comparison should not run on startup');
    assert.equal(before.pathComparisons, 0, 'closed path comparison should not run on startup');
    assert.deepEqual([before.pathTraces, before.binaryTraces, before.recursionTraces], [0, 0, 0], 'inactive traces should be initialized on demand');
    await page.evaluate(() => {
      new MutationObserver(changes => { window.__frontendStats.complexityMutations += changes.length; })
        .observe(document.querySelector('#complexity'), { childList: true, subtree: true, characterData: true });
    });
    await page.click('#step-button'); await page.click('#step-button'); await page.click('#step-button');
    let after = await stats();
    assert.equal(after.backgrounds, before.backgrounds, 'playback should reuse the canvas background');
    assert.equal(after.complexityMutations, 0, 'unchanged complexity should not be rebuilt on every step');
    await page.waitForTimeout(100);
    before = await stats();
    await page.evaluate(() => { for (let i = 0; i < 40; i++) window.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(100);
    after = await stats();
    assert.ok(after.canvasMeasures - before.canvasMeasures <= 2, 'resize events should be coalesced');
    assert.ok(after.canvasMeasures > before.canvasMeasures, 'a resize burst should still schedule a redraw');

    await page.selectOption('#sort-algorithm', 'selection');
    if (mobile) {
      const fits = await page.locator('#sort-algorithm').evaluate(select => {
        const style = getComputedStyle(select), context = document.createElement('canvas').getContext('2d');
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 18; // Native arrow.
        return [...select.options].every(option => context.measureText(option.textContent).width <= available);
      });
      assert.ok(fits, 'algorithm names should fit beside the native select arrow');
    }
    assert.equal((await stats()).sortComparisons, 0);
    await page.click('#sort-comparison summary');
    assert.equal(await page.locator('#compare-results tr').count(), 4);
    assert.equal((await stats()).sortComparisons, 1);
    await page.locator('[data-compare-algorithm="merge"]').click();
    assert.equal(await page.locator('#sort-algorithm').inputValue(), 'merge');
    assert.equal((await stats()).sortComparisons, 1, 'switching algorithms should reuse the same-input result');
    await page.click('#sort-comparison summary');
    await page.selectOption('#sort-size', '20');
    assert.equal((await stats()).sortComparisons, 1, 'closed comparisons should stay lazy after edits');
    await page.click('#sort-comparison summary');
    assert.equal((await stats()).sortComparisons, 2, 'a new input should invalidate the cache');
    const sortRows = await page.locator('#compare-results tr').evaluateAll(rows => rows.map(row => ({
      algorithm: row.querySelector('button').dataset.compareAlgorithm,
      comparisons: Number(row.cells[1].textContent), writes: Number(row.cells[2].textContent)
    })));
    const input = (await page.locator('#compare-input').innerText()).split('·').map(value => Number(value.trim()));
    const expectedSort = await page.evaluate(input => ['bubble', 'selection', 'insertion', 'merge'].map(algorithm => {
      const result = window.AlgorithmModels.sortTrace(input, algorithm).at(-1);
      return { algorithm, comparisons: result.comparisons, writes: result.writes };
    }), input);
    assert.deepEqual(sortRows, expectedSort);
    await page.click('#sort-comparison summary'); await page.click('#sort-comparison summary');
    assert.equal((await stats()).sortComparisons, 2, 'reopening unchanged input should use the cache');

    await page.selectOption('#topic-select', 'pathfinding');
    assert.equal((await stats()).pathTraces, 1, 'the first visit should initialize the search trace');
    await page.click('[data-action="clear-walls"]');
    await page.locator('#experiment-canvas').focus(); await page.keyboard.press('Space'); await page.keyboard.press('Space');
    assert.equal((await stats()).pathComparisons, 0, 'editing a closed grid comparison should not run it');
    await page.click('#path-comparison summary');
    assert.equal(await page.locator('#path-compare-results tr').count(), 3);
    assert.equal((await stats()).pathComparisons, 1);
    await page.locator('[data-path-compare="astar"]').click();
    assert.equal(await page.locator('#path-algorithm').inputValue(), 'astar');
    assert.equal((await stats()).pathComparisons, 1, 'choosing another search should reuse grid totals');
    await page.locator('#experiment-canvas').focus(); await page.keyboard.press('Space');
    assert.equal((await stats()).pathComparisons, 2, 'editing walls must invalidate an open comparison');
    assert.match(await page.locator('#path-compare-input').innerText(), /^1 wall\b/);
    const pathRows = await page.locator('#path-compare-results tr').evaluateAll(rows => rows.map(row => ({
      algorithm: row.querySelector('button').dataset.pathCompare,
      visited: Number(row.cells[1].textContent), path: row.cells[2].textContent
    })));
    const expectedPath = await page.evaluate(() => {
      const M = window.AlgorithmModels, { cols, rows, start, goal } = M.GRID;
      return ['bfs', 'dfs', 'astar'].map(algorithm => {
        const last = M.pathTrace(cols, rows, [38], start, goal, algorithm).at(-1);
        return { algorithm, visited: last.visited.length, path: last.found ? `${last.path.length - 1} moves` : 'No route' };
      });
    });
    assert.deepEqual(pathRows, expectedPath);

    // Hit-testing must use the latest size even before a scheduled resize redraw runs.
    const hitLabel = await page.evaluate(() => {
      const canvas = document.querySelector('#experiment-canvas');
      canvas.style.width = '70%'; window.dispatchEvent(new Event('resize'));
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / (rect.width < 500 ? 435 : 700), rect.height / (rect.width < 500 ? 270 : 300));
      const x = (rect.width - 700 * scale) / 2, y = (rect.height - 300 * scale) / 2;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: rect.left + x + (164 + 7 * 31 + 13.5) * scale, clientY: rect.top + y + (40 + 3 * 31 + 13.5) * scale }));
      canvas.style.width = '';
      return canvas.getAttribute('aria-label');
    });
    assert.match(hitLabel, /Selected cell 8, 4, wall/);

    if (mobile) {
      const dimensions = await page.evaluate(() => {
        const size = selector => { const node = document.querySelector(selector), box = node.getBoundingClientRect(); return { width: box.width, height: box.height, font: parseFloat(getComputedStyle(node).fontSize) }; };
        return { select: size('#topic-select'), control: size('#path-algorithm'), button: size('#step-button'), reset: size('#reset-button'), timeline: size('#trace-position') };
      });
      assert.ok(dimensions.select.height >= 44 && dimensions.control.height >= 44 && dimensions.button.height >= 44 && dimensions.reset.height >= 44);
      assert.ok(dimensions.select.font >= 16 && dimensions.control.font >= 16 && dimensions.timeline.height >= 44);
      for (const id of ['speed', 'trace-position']) {
        const slider = page.locator(`#${id}`);
        await slider.scrollIntoViewIfNeeded();
        const box = await slider.boundingBox(), previous = await slider.inputValue();
        await page.touchscreen.tap(box.x + box.width * .85, box.y + 5);
        assert.notEqual(await slider.inputValue(), previous, `${id} should respond across its enlarged touch area`);
      }
      await page.selectOption('#topic-select', 'linear');
      const fits = await page.locator('#topic-select').evaluate(select => {
        const style = getComputedStyle(select), context = document.createElement('canvas').getContext('2d');
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(select.selectedOptions[0].textContent).width <= select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      });
      assert.ok(fits, 'long concept names should fit without truncation');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }

    // A programmatically opened panel must also populate, and the export stays offline.
    await page.selectOption('#topic-select', 'sorting');
    offline = true;
    await context.setOffline(true);
    await page.goto(pathToFileURL(path.join(root, 'standalone.html')).href, { waitUntil: 'load' });
    await page.locator('#sort-comparison').evaluate(panel => { panel.open = true; });
    await page.waitForFunction(() => document.querySelectorAll('#compare-results tr').length === 4);
    await page.selectOption('#topic-select', 'pathfinding'); await page.selectOption('#path-algorithm', 'astar'); await page.click('#step-button');
    assert.equal(await page.locator('#astar-f').innerText(), '9');
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(offlineRequests, []);
    console.log(`PASS: frontend performance, cache invalidation, canvas hit-testing, ${width}px layout and offline export.`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
