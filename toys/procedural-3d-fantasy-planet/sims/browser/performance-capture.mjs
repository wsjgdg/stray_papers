// End-to-end opt-in performance recorder: normal live scene, real input, no masks or paused renders.
// Results are measurements of the supplied browser/environment, not display FPS or human acceptance.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const threeRoot = path.resolve(here, '../node_modules/three'), executablePath = process.env.CHROME_PATH;
const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('Set CHROME_PATH to an installed Chromium/Chrome executable.');
if (!fs.existsSync(path.join(threeRoot, 'build/three.module.js'))) throw new Error('Run npm ci --prefix sims first.');
const args = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) throw new Error('CHROME_ARGS must be a JSON array.');
let html = fs.readFileSync(process.env.BROWSER_PAGE_HTML || path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports.');
html = html.split(cdn).join('/__three/').replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const server = http.createServer((req, res) => {
  let url; try { url = new URL(req.url, 'http://127.0.0.1'); } catch (_) { res.writeHead(400).end(); return; }
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(html); return; }
  if (!url.pathname.startsWith('/__three/')) { res.writeHead(404).end(); return; }
  let file; try { file = path.resolve(threeRoot, decodeURIComponent(url.pathname.slice('/__three/'.length))); }
  catch (_) { res.writeHead(400).end(); return; }
  if (!file.startsWith(threeRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }); fs.createReadStream(file).pipe(res);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const check = (name, condition, detail = '') => {
  if (!condition) throw new Error(name + (detail ? ' — ' + detail : ''));
  console.log('  PASS ' + name + (detail ? ' — ' + detail : ''));
};
const output = process.env.BROWSER_CAPTURE_DIR;
if (output) fs.mkdirSync(output, { recursive: true });
const save = (name, result) => { if (output) fs.writeFileSync(path.join(output, name), JSON.stringify(result, null, 2) + '\n'); };
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'aetheris-perf-download-'));
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...args], protocolTimeout: timeout });
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Keep touch capability constant when changing the viewport later: toggling hasTouch reloads
  // Chromium and would erase the deliberately session-only report we are about to verify.
  await page.setViewport({ width: 480, height: 270, deviceScaleFactor: Number(process.env.BROWSER_SCALE || .5), hasTouch: true });
  await page.goto('http://127.0.0.1:' + server.address().port + '/', { waitUntil: 'domcontentloaded', timeout });
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.aetheris?.performanceCapture)), { timeout, polling: 1000 });
  check('the uninstrumented page starts and its recorder is idle', await page.evaluate(() => window.aetherisStartup.ready &&
    !window.aetherisStartup.error && window.aetheris.performanceCapture().phase === 'idle'));
  const capture = async (mode, move) => {
    await page.keyboard.press('o');
    await page.waitForSelector('#perfStart', { visible: true, timeout });
    // The panel slides for 550 ms. A click while it is still moving can land on the canvas instead.
    await page.waitForFunction(() => document.body.classList.contains('archive-open') &&
      document.getElementById('archive').getBoundingClientRect().right <= innerWidth + 1, { timeout, polling: 250 });
    await page.click('#perfStart');
    const prepared = await page.evaluate(() => window.aetheris.performanceCapture());
    check(`${mode}: opening the archive and preparing does not start sampling`, prepared.phase === 'armed', JSON.stringify(prepared));
    await page.click('#archiveClose');
    await page.waitForFunction(() => window.aetheris.performanceCapture().phase === 'recording', { timeout, polling: 250 });
    check(`${mode}: closed archive and visible canvas continue during recording`, await page.evaluate(() => {
      const canvas = document.querySelector('#scene canvas'), badge = document.getElementById('perfIndicator');
      return document.visibilityState === 'visible' && !document.body.classList.contains('archive-open') &&
        getComputedStyle(canvas).display !== 'none' && !badge.hidden && badge.textContent === 'REC';
    }));
    if (move) await page.keyboard.down('w');
    await page.waitForFunction(() => window.aetheris.performanceCapture().phase === 'ready', { timeout, polling: 1000 });
    if (move) await page.keyboard.up('w');
    const result = await page.evaluate(() => ({ report: window.aetheris.performanceReport(),
      badge: document.getElementById('perfIndicator').textContent, shown: !document.getElementById('perfIndicator').hidden }));
    const r = result.report;
    check(`${mode}: capture completes with actual samples and a finished badge`, r.status === 'completed' &&
      r.sampledDurationMs >= 20000 && r.summary.frames >= 3 && r.summary.rafIntervalMs.count === r.summary.frames - 1 &&
      r.samples.every(s => s.mode === mode && !s.transition) && result.badge === '完成' && result.shown,
      `${r.summary.frames} frames, ${r.sampledDurationMs} ms, GPU timer ${JSON.stringify(r.gpuTimer)}`);
    check(`${mode}: sampled stage times are finite and never pretend to be display timestamps`,
      r.samples.every(s => Number.isFinite(s.worldWallMs) && Number.isFinite(s.renderCallWallMs)) &&
      r.notes.some(note => note.includes('not presentation')) && !('url' in r.environment));
    save(mode + '.json', r);
    console.log(`  INFO ${mode}: ` + JSON.stringify({ raf: r.summary.rafIntervalMs, cpuWorld: r.summary.worldWallMs,
      render: r.summary.renderCallWallMs, gpu: r.summary.gpuElapsedMs, codex: r.summary.codexScanWallMs,
      renderer: r.environment.gpu }));
    return r;
  };
  const orbit = await capture('orbit', false);
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.aetheris.diagnostics().mode === 'ground' &&
    !document.body.classList.contains('transitioning'), { timeout, polling: 1000 });
  check('the normal F-key transition lands before the ground sample', true);
  const ground = await capture('ground', true);
  check('ground samples preserve actual scene draw statistics and quality state',
    ground.samples.every(s => s.drawCalls > 0 && s.triangles > 0 && s.tier && s.canvasWidth > 0));

  await page.setViewport({ width: 320, height: 568, deviceScaleFactor: Number(process.env.BROWSER_SCALE || .5), hasTouch: true });
  await page.keyboard.press('o');
  await page.waitForSelector('#perfShow', { visible: true, timeout });
  await page.waitForFunction(() => document.body.classList.contains('archive-open') &&
    document.getElementById('archive').getBoundingClientRect().right <= innerWidth + 1, { timeout, polling: 250 });
  await page.tap('#perfShow');
  const shown = await page.$eval('#perfText', text => ({ hidden: text.hidden, value: text.value }));
  check('the narrow touch layout can display a manually copyable JSON report', !shown.hidden &&
    JSON.parse(shown.value).summary.frames === ground.summary.frames);
  const session = await browser.target().createCDPSession();
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: temp, eventsEnabled: true });
  const downloaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for JSON download.')), timeout);
    session.on('Browser.downloadProgress', event => {
      if (event.state === 'completed') { clearTimeout(timer); resolve(); }
      else if (event.state === 'canceled') { clearTimeout(timer); reject(new Error('JSON download canceled.')); }
    });
  });
  await page.click('#perfDownload'); await downloaded;
  const file = fs.readdirSync(temp).find(name => name.endsWith('.json'));
  check('the UI downloads the completed JSON without an upload', !!file &&
    JSON.parse(fs.readFileSync(path.join(temp, file), 'utf8')).summary.frames === ground.summary.frames, file || 'missing file');

  await page.click('#perfStart'); await page.click('#archiveClose');
  await page.waitForFunction(() => window.aetheris.performanceCapture().phase === 'recording', { timeout, polling: 250 });
  await page.keyboard.press('g');
  await page.waitForFunction(() => window.aetheris.performanceCapture().phase === 'interrupted', { timeout, polling: 250 });
  const partial = await page.evaluate(() => window.aetheris.performanceReport());
  check('opening the map during capture marks the partial report interrupted',
    partial.status === 'interrupted' && partial.reason === 'map-opened');
  const glError = await page.evaluate(() => document.querySelector('#scene canvas').getContext('webgl2').getError());
  check('GPU query collection leaves the real WebGL context without errors', glError === 0, 'gl.getError=' + glError);
  check('the page reports no JavaScript/WebGL console errors', !errors.length, errors.slice(0, 3).join(' | '));
  check('orbit and ground reports are independent', orbit !== ground && orbit.samples.every(s => s.mode === 'orbit'));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
}
