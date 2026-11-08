// Optional real-context checks for the startup antialias policy. Each case loads a fresh page/context;
// WebGL context attributes cannot be changed in place. The simulated-hardware case replaces only the
// probe's reported name in the isolated test page; it does not claim the machine has a hardware GPU.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const threeRoot = path.resolve(here, '../node_modules/three');
const executablePath = process.env.CHROME_PATH;
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error('Set CHROME_PATH to an installed Chromium/Chrome executable (no browser is bundled).');
}
if (!fs.existsSync(path.join(threeRoot, 'build/three.module.js'))) {
  throw new Error('Install the main test dependencies first: npm ci --prefix sims');
}
const viewport = {
  width: Number(process.env.BROWSER_WIDTH || 480), height: Number(process.env.BROWSER_HEIGHT || 270),
  deviceScaleFactor: Number(process.env.BROWSER_SCALE || .5)
};
const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
const extraArgs = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(extraArgs) || extraArgs.some(arg => typeof arg !== 'string')) {
  throw new Error('CHROME_ARGS must be a JSON array of Chromium argument strings.');
}
let html = fs.readFileSync(process.env.BROWSER_PAGE_HTML || path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports; inspect the browser proxy mapping.');
html = html.split(cdn).join('/__three/');
html = html.replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const anchor = '      window.aetheris={';
if (html.split(anchor).length !== 2) throw new Error('Cannot find the unique observability insertion point.');
html = html.replace(anchor, '      window.__aaProbe={renderer,getComposer:()=>composer};\n' + anchor);
const probeAnchor = '        startup.graphics = probe;';
if (html.split(probeAnchor).length !== 2) throw new Error('Cannot find the unique graphics-probe insertion point.');
const simulatedHardware = html.replace(probeAnchor, "        probe.gpu='Simulated hardware GPU';\n" + probeAnchor);

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); }
  catch (_) { res.writeHead(400).end(); return; }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(url.searchParams.get('testFakeHardware') === '1' ? simulatedHardware : html); return;
  }
  if (!url.pathname.startsWith('/__three/')) { res.writeHead(404).end(); return; }
  let file;
  try { file = path.resolve(threeRoot, decodeURIComponent(url.pathname.slice('/__three/'.length))); }
  catch (_) { res.writeHead(400).end(); return; }
  if (!file.startsWith(threeRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const baseUrl = 'http://127.0.0.1:' + server.address().port + '/';
const check = (name, condition, info = '') => {
  if (!condition) throw new Error(name + (info ? ' — ' + info : ''));
  console.log('  PASS ' + name + (info ? ' — ' + info : ''));
};
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...extraArgs], protocolTimeout: timeout });
  for (const test of [
    { label: 'auto', query: '', mode: 'auto' },
    { label: 'explicit on', query: '?aa=on', mode: 'on' },
    { label: 'explicit off', query: '?aa=off', mode: 'off' },
    { label: 'auto with simulated hardware name', query: '?testFakeHardware=1', mode: 'auto', simulated: true }
  ]) {
    const page = await browser.newPage(), errors = [];
    try {
      await page.setViewport(viewport);
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(baseUrl + test.query, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForFunction(() => window.aetherisStartup &&
        (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__aaProbe)), { timeout, polling: 1000 });
      const startupError = await page.evaluate(() => window.aetherisStartup.error || '');
      if (startupError) throw new Error(test.label + ': page startup failed — ' + startupError);
      const before = await page.evaluate(() => {
        const p = window.__aaProbe, gl = p.renderer.getContext(), attrs = gl.getContextAttributes();
        const composer = p.getComposer();
        return { startupError: window.aetherisStartup.error, gpu: window.aetherisStartup.graphics?.gpu,
          diagnostics: window.aetheris.diagnostics(), actual: attrs?.antialias ?? null,
          framebufferSamples: gl.getParameter(gl.SAMPLES), composerSamples: composer ?
            [composer.renderTarget1.samples, composer.renderTarget2.samples] : null,
          tooltip: document.getElementById('qualityStatus').title };
      });
      check(test.label + ': page started', !before.startupError, before.startupError || before.gpu);
      const expected = test.mode === 'on' ? true : test.mode === 'off' ? false : !/\bswiftshader\b/i.test(before.gpu || '');
      check(test.label + ': selected the expected policy', before.diagnostics.antialiasMode === test.mode &&
        before.diagnostics.antialiasRequested === expected,
      'requested ' + before.diagnostics.antialiasRequested + (test.simulated ? ' (simulated probe name)' : ''));
      check(test.label + ': diagnostics report actual context attributes', before.diagnostics.antialias === before.actual &&
        (before.actual === true || before.actual === false),
      'actual ' + before.actual + ', current framebuffer samples ' + before.framebufferSamples);
      const expectedSamples = expected ? 4 : 0;
      check(test.label + ': post-processing targets follow the same request',
        (!before.composerSamples && process.env.BROWSER_AA_REQUIRE_COMPOSER !== '1') ||
        !!before.composerSamples?.every(samples => samples === expectedSamples),
      before.composerSamples ? before.composerSamples.join(' / ') : 'no composer at this viewport');
      await page.keyboard.press('q'); await page.keyboard.press('q');
      const after = await page.evaluate(() => window.aetheris.diagnostics());
      check(test.label + ': Q does not change the fixed context', after.quality === 'balanced' &&
        after.antialiasRequested === before.diagnostics.antialiasRequested && after.antialias === before.actual &&
        before.tooltip.includes('aa=on') && before.tooltip.includes('aa=off'));
      if (test.mode === 'off' && process.env.BROWSER_AA_CONTEXT_RESTORE === '1') {
        const available = await page.evaluate(() => {
          const gl = window.__aaProbe.renderer.getContext();
          window.__aaRestoreExt = gl.getExtension('WEBGL_lose_context');
          if (!window.__aaRestoreExt) return false;
          window.__aaLost = false; window.__aaRestored = false;
          window.__aaProbe.renderer.domElement.addEventListener('webglcontextlost', () => { window.__aaLost = true; }, { once: true });
          window.__aaProbe.renderer.domElement.addEventListener('webglcontextrestored', () => { window.__aaRestored = true; }, { once: true });
          window.__aaRestoreExt.loseContext();
          return true;
        });
        check(test.label + ': context-loss extension is available', available);
        await page.waitForFunction(() => window.__aaLost, { timeout, polling: 500 });
        const lost = await page.evaluate(() => ({ diagnostics: window.aetheris.diagnostics(),
          title: document.getElementById('qualityStatus').title,
          aria: document.getElementById('qualityStatus').getAttribute('aria-label') }));
        check(test.label + ': lost context reports unknown actual antialiasing', lost.diagnostics.antialias === null &&
          lost.diagnostics.antialiasRequested === false);
        check(test.label + ': quality label reports unknown during context loss',
          lost.title.includes('Antialiasing unknown') && lost.aria.includes('Antialiasing unknown'));
        await page.evaluate(() => window.__aaRestoreExt.restoreContext());
        await page.waitForFunction(() => window.__aaRestored && !window.__aaProbe.renderer.getContext().isContextLost(),
          { timeout, polling: 500 });
        const restored = await page.evaluate(() => ({ diagnostics: window.aetheris.diagnostics(),
          title: document.getElementById('qualityStatus').title,
          aria: document.getElementById('qualityStatus').getAttribute('aria-label') }));
        check(test.label + ': restored context retains the request', restored.diagnostics.antialias === before.actual &&
          restored.diagnostics.antialiasRequested === false);
        check(test.label + ': quality label reports the recovered actual setting',
          restored.title.includes('Antialiasing off') && restored.aria.includes('Antialiasing off'));
      }
      check(test.label + ': no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    } finally {
      await page.close();
    }
  }
  console.log('\nAntialias policy checked with fresh WebGL contexts. The simulated hardware name is not a hardware test.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
