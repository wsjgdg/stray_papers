// Optional real-browser smoke: actual WebGL2, requestAnimationFrame, keyboard and Web Audio. The app's
// source is served with only an in-memory observability hook; its CDN imports resolve to the same locked
// local three.js and external fonts are omitted. It is not a visual, audible, hardware or CDN acceptance.
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
  deviceScaleFactor: Number(process.env.BROWSER_SCALE || 1)
};
const timeout = Number(process.env.BROWSER_TIMEOUT_MS || 210000);
const extraArgs = process.env.CHROME_ARGS ? JSON.parse(process.env.CHROME_ARGS) : [];
if (!Array.isArray(extraArgs) || extraArgs.some(arg => typeof arg !== 'string')) {
  throw new Error('CHROME_ARGS must be a JSON array of Chromium argument strings.');
}

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cdn = 'https://cdn.jsdelivr.net/npm/three@0.174.0/';
if (html.split(cdn).length !== 3) throw new Error('Unexpected three.js imports; inspect the browser proxy mapping.');
html = html.split(cdn).join('/__three/');
html = html.replace(/\s*<link\b[^>]*href="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^\"]*"[^>]*>/g, '');
const anchor = '      window.aetheris={';
if (html.split(anchor).length !== 2) throw new Error('Cannot find the unique observability insertion point.');
html = html.replace(anchor,
  '      window.__browserProbe={state,landing,CODEX,renderer,getAudio:()=>audio};\n' + anchor);

// Listen only on loopback: this isolated test server is not the user's preview on port 8080.
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://127.0.0.1'); }
  catch (_) { res.writeHead(400).end(); return; }
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(html); return;
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
const url = 'http://127.0.0.1:' + server.address().port + '/';
let browser;
try {
  browser = await puppeteer.launch({ executablePath, headless: process.env.BROWSER_HEADLESS_SHELL === '1' ? 'shell' : true,
    args: ['--disable-dev-shm-usage', ...extraArgs], protocolTimeout: timeout });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // Observe, but do not replace, Web Audio. Reading .frequency.value just after scheduling returns
  // the oscillator's default 440 Hz in Chromium; record the actual first setValueAtTime instead.
  await page.evaluateOnNewDocument(() => {
    const scheduled = new WeakMap();
    const setValue = window.AudioParam.prototype.setValueAtTime;
    window.AudioParam.prototype.setValueAtTime = function (value, time) {
      if (!scheduled.has(this)) scheduled.set(this, value);
      return setValue.call(this, value, time);
    };
    const start = window.OscillatorNode.prototype.start;
    window.__oscillatorStarts = [];
    window.OscillatorNode.prototype.start = function (...args) {
      window.__oscillatorStarts.push({ frequency: scheduled.get(this.frequency) ?? this.frequency.value,
        at: this.context.currentTime });
      return start.apply(this, args);
    };
  });
  const check = (label, condition, info = '') => {
    if (!condition) throw new Error(label + (info ? ' — ' + info : ''));
    console.log('  PASS ' + label + (info ? ' — ' + info : ''));
  };
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  check('HTTP page is served', response?.status() === 200);
  await page.waitForFunction(() => window.aetherisStartup &&
    (window.aetherisStartup.error || (window.aetherisStartup.ready && window.__browserProbe)),
  { timeout, polling: 1000 });
  const startup = await page.evaluate(() => ({ ready: window.aetherisStartup.ready, error: window.aetherisStartup.error,
    graphics: window.aetherisStartup.graphics, checks: window.aetherisStartup.checks.length,
    build: window.aetheris?.diagnostics().build || window.aetherisStartup.build, mode: window.aetheris?.diagnostics().mode }));
  check('WebGL2 world starts without an application error',
    startup.ready && !startup.error && startup.graphics?.webgl2 && startup.mode === 'orbit',
    startup.build + ', ' + startup.checks + ' checks; ' + startup.graphics?.gpu);

  // This listener is registered after the page's handler, so it captures the state immediately after
  // a real keydown even if a slow GPU finishes the animation before the protocol can inspect it.
  await page.evaluate(() => window.addEventListener('keydown', event => {
    if (event.repeat || !['KeyF', 'Space'].includes(event.code)) return;
    const state = window.__browserProbe?.state;
    if (!state) return;
    if (event.code === 'KeyF') window.__descentStart = { mode: state.mode, duration: state.transition?.duration };
    else window.__jumpStart = { grounded: state.grounded, velocity: state.velocity };
  }));
  const began = Date.now();
  await page.keyboard.press('f');
  const transition = await page.evaluate(() => ({ ...window.__descentStart,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }));
  check('real F key starts the default, non-reduced 1.8 s descent',
    transition.mode === 'ground' && transition.duration === 1.8 && !transition.reduced, JSON.stringify(transition));
  await page.waitForFunction(() => window.__browserProbe.state.mode === 'ground' && !window.__browserProbe.state.transition,
    { timeout, polling: 1000 });
  const landed = await page.evaluate(() => ({ error: window.__browserProbe.state.direction.distanceTo(window.__browserProbe.landing) * 4.2,
    seen: window.__browserProbe.CODEX.filter(entry => entry.seen).map(entry => entry.id) }));
  const wallSeconds = (Date.now() - began) / 1000;
  check('actual animation loop finishes at the intended landing', landed.error < 1e-5,
    'landing error ' + (landed.error * 1000).toFixed(3) + ' mm; wall time ' + wallSeconds.toFixed(1) + ' s');
  const budget = Number(process.env.BROWSER_MAX_TRANSITION_SECONDS || 0);
  if (budget) check('transition wall time meets the explicitly requested machine budget', wallSeconds <= budget);

  await page.keyboard.press('m');
  const sound = await page.evaluate(() => ({ pressed: document.getElementById('soundButton').getAttribute('aria-pressed'),
    state: window.__browserProbe.getAudio()?.ctx.state }));
  check('real M key enables a running browser AudioContext', sound.pressed === 'true' && sound.state === 'running');
  await page.evaluate(() => {
    const audio = window.__browserProbe.getAudio(), analyser = audio.ctx.createAnalyser();
    analyser.fftSize = 2048; audio.master.connect(analyser); window.__smokeAnalyser = analyser;
    window.__walkStart = window.__browserProbe.state.direction.clone();
    window.__footfallStart = window.__browserProbe.state.footfalls;
    window.__audioMark = window.__oscillatorStarts.length;
  });
  await page.keyboard.down('w');
  try {
    await page.waitForFunction(() => {
      const state = window.__browserProbe.state;
      const step = window.__oscillatorStarts.slice(window.__audioMark).some(s => [54, 58, 66, 92, 180].includes(Math.round(s.frequency)));
      return state.footfalls > window.__footfallStart && state.lastFootfall === state.footfalls && step;
    }, { timeout, polling: 1000 });
  } finally { await page.keyboard.up('w'); }
  const walking = await page.evaluate(() => {
    const s = window.__browserProbe.state, wave = new Float32Array(window.__smokeAnalyser.fftSize);
    window.__smokeAnalyser.getFloatTimeDomainData(wave);
    let power = 0; for (const x of wave) power += x * x;
    return { distance: s.direction.distanceTo(window.__walkStart) * 4.2, footfalls: s.footfalls - window.__footfallStart,
      last: s.lastFootfall, total: s.footfalls, rms: Math.sqrt(power / wave.length),
      frequencies: window.__oscillatorStarts.slice(window.__audioMark).map(x => x.frequency) };
  });
  check('real W key walks and schedules a real footfall sound', walking.distance > .002 && walking.footfalls > 0 &&
    walking.last === walking.total && walking.frequencies.some(f => [54, 58, 66, 92, 180].includes(Math.round(f))),
    (walking.distance * 1000).toFixed(1) + ' mm, ' + walking.footfalls + ' steps; oscillator ' + walking.frequencies.join(', '));
  check('the audio master carries a nonzero signal', walking.rms > .000001, 'RMS ' + walking.rms.toFixed(5));

  await page.keyboard.down('h');
  try {
    await page.waitForFunction(() => window.__browserProbe.state.ghost &&
      document.getElementById('modeName').textContent.includes('PHASING'), { timeout, polling: 500 });
  } finally { await page.keyboard.up('h'); }
  await page.waitForFunction(() => !window.__browserProbe.state.ghost &&
    !document.getElementById('modeName').textContent.includes('PHASING'), { timeout, polling: 500 });
  check('real H key enters and leaves phasing with the correct HUD label', true);
  await page.keyboard.press('o');
  const archive = await page.evaluate(() => ({ open: document.body.classList.contains('archive-open'),
    count: document.querySelector('.codex-count')?.textContent,
    news: document.getElementById('archiveChip').classList.contains('has-news') }));
  check('real O key opens the archive and displays the ground discoveries', archive.open &&
    /^[1-8]\s*\/\s*8$/.test(archive.count?.trim() || '') && !archive.news,
  (archive.count || 'missing count') + '; notification cleared=' + !archive.news);
  await page.keyboard.press('o');
  await page.waitForFunction(() => window.__browserProbe.state.grounded && !window.__browserProbe.state.water,
    { timeout, polling: 500 });
  await page.keyboard.down('Space');
  const jumped = await page.evaluate(() => window.__jumpStart);
  await page.keyboard.up('Space');
  check('real Space key initiates a grounded jump', !!jumped && !jumped.grounded && jumped.velocity > 0,
    'initial vertical speed ' + (jumped?.velocity || 0).toFixed(3));
  await page.keyboard.press('m');
  await page.waitForFunction(() => window.__browserProbe.getAudio().master.gain.value < .1, { timeout, polling: 500 });
  const muted = await page.evaluate(() => document.getElementById('soundButton').getAttribute('aria-pressed'));
  check('real M key turns the sound down again', muted === 'false');
  check('no page or console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  if (process.env.BROWSER_SCREENSHOT) {
    await page.evaluate(() => window.__browserProbe.renderer.setAnimationLoop(null));
    await page.screenshot({ path: process.env.BROWSER_SCREENSHOT, captureBeyondViewport: false });
    console.log('  screenshot: ' + process.env.BROWSER_SCREENSHOT + ' (loop paused, not a hardware visual review)');
  }
  console.log('\nBrowser smoke passed. Local three.js, no external fonts, no human visual/audio acceptance.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
